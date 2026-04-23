import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import * as shopifyApi from '../../sync/lib/shopify';

export async function POST(req: NextRequest) {
    // Auth check — only allow with valid CRON_SECRET
    const secret = req.headers.get('authorization')?.replace('Bearer ', '') || req.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const payload = await req.json();
        const { shop_id, receipt_id, transactions } = payload;

        if (!shop_id || !receipt_id || !transactions || !Array.isArray(transactions)) {
            return NextResponse.json({ success: false, error: 'Bölge eksik (shop_id, receipt_id veya transactions)' }, { status: 400 });
        }

        const supabase = createAdminClient();
        const logPrefix = `[Simulator API - Receipt ${receipt_id}]`;

        // 1. Get the shop
        const { data: shop } = await supabase
            .from('shops')
            .select('*')
            .eq('id', shop_id)
            .maybeSingle();

        if (!shop) {
            return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 });
        }

        // 2. Get settings
        const { data: settings } = await supabase
            .from('shop_settings')
            .select('location_deduction_order')
            .eq('shop_id', shop.id)
            .maybeSingle();

        const logs: string[] = [];

        for (const tx of transactions) {
            const listingId = tx.listing_id?.toString();
            const quantity = Number(tx.quantity) || 1;

            if (!listingId) continue;

            logs.push(`İşleniyor: Etsy Listing ID ${listingId}, Adet: ${quantity}`);

            // 6. Find matching inventory_item
            const { data: item } = await supabase
                .from('inventory_items')
                .select('id, master_stock, shopify_inventory_item_id, selected_location_ids, location_inventory_map')
                .eq('shop_id', shop.id)
                .eq('etsy_listing_id', listingId)
                .maybeSingle();

            if (!item || !item.shopify_inventory_item_id) {
                logs.push(`⚠️ Uyarı: ${listingId} için bağlı Shopify ürünü bulunamadı.`);
                continue;
            }

            // 7. Decrease Shopify stock using Cascade Deduction
            const newStock = Math.max(0, (item.master_stock || 0) - quantity);
            let deductionOrder: string[] = settings?.location_deduction_order || [];

            if (!deductionOrder || deductionOrder.length === 0) {
                if (item.selected_location_ids && item.selected_location_ids.length > 0) {
                    deductionOrder = item.selected_location_ids;
                } else if (shop.main_location_id) {
                    deductionOrder = [shop.main_location_id.toString()];
                }
            }

            if (deductionOrder.length > 0 && shop.access_token) {
                try {
                    const creds = { shopDomain: shop.shop_domain, accessToken: shop.access_token };
                    
                    const levelsData = await shopifyApi.getInventoryLevels(creds, deductionOrder, item.shopify_inventory_item_id);
                    const levels = (levelsData.inventory_levels || []).filter(
                        (l: any) => l.inventory_item_id.toString() === item.shopify_inventory_item_id
                    );

                    let remainingToDeduct = quantity;
                    
                    for (const locId of deductionOrder) {
                        if (remainingToDeduct <= 0) break;

                        const level = levels.find((l: any) => l.location_id.toString() === locId);
                        if (level) {
                            const currentShopifyStock = level.available || 0;
                            if (currentShopifyStock > 0) {
                                const deductAmount = Math.min(currentShopifyStock, remainingToDeduct);
                                const newShopifyStock = currentShopifyStock - deductAmount;
                                
                                await shopifyApi.setInventoryLevel(creds, locId, item.shopify_inventory_item_id, newShopifyStock);
                                logs.push(`✅ Shopify Lokasyon ID ${locId} stok düşüldü: ${currentShopifyStock} ➔ ${newShopifyStock} (-${deductAmount})`);
                                
                                remainingToDeduct -= deductAmount;
                            } else {
                                logs.push(`ℹ️ Lokasyon ${locId} içinde stok yetersiz (0). Sonraki lokasyona geçiliyor...`);
                            }
                        }
                    }

                    if (remainingToDeduct > 0) {
                        logs.push(`⚠️ Dikkat: Kalan ${remainingToDeduct} adet eksiğe düşülemedi. Tüm lokasyonlarda toplam stok yetersiz.`);
                    }

                } catch (shopifyErr: any) {
                    logs.push(`❌ Shopify kaskad stok güncelleme hatası: ${shopifyErr.message}`);
                }
            } else {
                 logs.push(`❌ Lokasyon order dizilimi bulunamadı.`);
            }

            // 8. Update DB
            await supabase.from('inventory_items').update({
                master_stock: newStock,
                etsy_stock_snapshot: Math.max(0, (item.master_stock || 0) - quantity),
                etsy_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', item.id);
            logs.push(`🔄 Veritabanı "master_stock" başarıyla ${newStock} olarak güncellendi.`);
        }

        // 9. Log the receipt
        await supabase.from('sync_logs').insert({
            shop_id: shop.id,
            source: 'etsy',
            event_type: 'order',
            direction: 'etsy_to_shopify',
            status: 'success',
            metadata: {
                etsy_receipt_id: receipt_id.toString() + "_SIMULATED",
                transaction_count: transactions.length,
                is_simulated: true,
                simulator_logs: logs
            },
            created_at: new Date().toISOString()
        });
        
        logs.push(`📝 History sistemine başarılı "Simüle Edilmiş Sipariş" (receipt_id: ${receipt_id}) loglandı.`);

        return NextResponse.json({ success: true, logs });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
