# MercSync Launch Implementation Plan

Bu dosya, MercSync'i Shopify App Store yayini ve Etsy public API izni icin hazir hale getirmek uzere uygulanacak pratik yol haritasidir. Amac: once publish engellerini kaldirmak, sonra urun deneyimini stabil hale getirmek.

## 0. Urun Ozeti

MercSync, Shopify ve Etsy arasinda stok senkronizasyonu yapan embedded Shopify app'tir.

Kullanici akisi:
- Merchant Shopify App Store'dan MercSync'i kurar.
- Etsy hesabini baglar.
- Shopify/Etsy urunlerini import eder.
- Urunleri eslestirir veya klonlar.
- Product sayfasinda eslesme, klonlama ve tracking'den cikarma islemlerini yapar.
- Inventory sayfasinda master stock ve platform stoklarini takip eder.
- Shopify/Etsy siparisleri ve stok degisiklikleri arka planda yakalanir.
- Karsi platforma yeni stok gonderilir.
- Settings sayfasindan bildirimler, fiyat kurallari ve sync ayarlari yonetilir.

## 1. P0 - Publish Oncesi Blokerler

### 1.1 Notification sistemi tek merkezden calismali

Mevcut sorun:
- `notifications.type` DB constraint'i yalnizca `sync_error`, `system_alert`, `billing` kabul ediyor.
- Kod ise `stock_zero`, `sync_failed`, `oversell_risk`, `token_expiring` insert etmeye calisiyor.
- Bu nedenle in-app notification insert islemleri constraint hatasiyla dusuyor.
- SQL trigger `sync_logs` failure durumunda notification yaziyor ama kullanici notification tercihlerini ve email kanalini dikkate almiyor.

Uygulama:
1. Yeni migration ekle:
   - `notifications.type` constraint'ini su tipleri kabul edecek sekilde guncelle:
     - `stock_zero`
     - `sync_failed`
     - `oversell_risk`
     - `token_expiring`
     - `system_alert`
     - `billing`
   - Geriye uyumluluk icin eski `sync_error` ya migrate edilmeli ya da constraint icinde gecici kabul edilmeli.
2. `createNotification()` tek dogru servis olsun.
3. SQL trigger ya kaldirilsin ya da sadece `sync_logs` yazsin; email ve tercih kontrolu Next.js servis tarafinda yapilsin.
4. `createNotification()` sunlari garanti etmeli:
   - Event kapaliysa hicbir kanal calismasin.
   - `in_app` aciksa `notifications` tablosuna insert etsin.
   - `email` aciksa ve `notification_email` varsa Resend ile mail gondersin.
   - Email hatasini loglasin ve sonucu takip edilebilir yapsin.
5. NotificationBell ikonlari yeni tiplerle eslensin:
   - `stock_zero`: critical
   - `oversell_risk`: warning
   - `sync_failed`: error
   - `token_expiring`: key/reconnect

Kontrol senaryolari:
- Stock 0 olunca bell'e notification dusmeli.
- Low stock threshold altina dusunce notification dusmeli.
- Etsy/Shopify sync fail olunca notification dusmeli.
- Email acik ve `RESEND_API_KEY` varsa email gitmeli.
- Email kapaliysa email gitmemeli.
- In-app kapaliysa bell'e dusmemeli.

### 1.2 Notification event kapsami tamamlanmali

Eksik tetikler:
- Etsy webhook stok dusuruyor ama notification tetiklemiyor.
- Token expiring ayari UI'da var ama backend event'i yok.
- Token refresh fail sadece `sync_logs` yaziyor.

Uygulama:
1. `frontend/app/api/webhooks/etsy/route.ts`
   - Cron'daki stock_zero / oversell_risk mantigi webhook'a da eklenmeli.
2. `frontend/app/api/cron/token-refresh/route.ts`
   - Token refresh basarisiz olursa `sync_failed` veya `token_expiring` notification olustur.
   - Token su kadar sure icinde expire olacaksa `token_expiring` notification olustur.
   - Ayni token icin spam olmamasi icin metadata veya son bildirim zamani kontrolu ekle.
3. Product sync failure ve price sync failure olaylari `sync_failed` notification'a baglanmali.

### 1.3 Email altyapisi production hazir hale getirilmeli

Mevcut durum:
- Resend helper var.
- `.env.example` eksik.
- Sender domain dogrulama yoruma birakilmis.

Uygulama:
1. `.env.example` guncelle:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SHOPIFY_CLIENT_ID`
   - `SHOPIFY_CLIENT_SECRET`
   - `SHOPIFY_APP_SLUG`
   - `SHOPIFY_APP_URL`
   - `ETSY_CLIENT_ID`
   - `ETSY_CLIENT_SECRET`
   - `ETSY_WEBHOOK_SECRET`
   - `CRON_SECRET`
   - `RESEND_API_KEY`
   - `NOTIFICATION_FROM_EMAIL`
2. `resend.ts` icinde hard-coded sender yerine env kullan:
   - default: `MercSync <notifications@mercsync.com>`
3. Resend domain SPF/DKIM production'da dogrulanmali.
4. Email template HTML escape/sanitize edilmeli; title/message dogrudan HTML'e basiliyor.

### 1.4 Shopify auth/session guvenligi kapatilmali

Kritik sorun:
- Middleware `?shop=` parametresini dogrulamadan `mercsync_shop` cookie'sine yaziyor.
- `getValidatedUserContext()` bu cookie ile admin Supabase client donduruyor.
- Bu, shop domain bilen birinin baska shop context'ine girme riskini dogurur.

Uygulama:
1. Embedded app icin Shopify session token veya OAuth HMAC dogrulamasi zorunlu olmali.
2. `mercsync_shop` cookie sadece dogrulanmis Shopify auth/callback sonrasi set edilmeli.
3. Server actions admin client kullanacaksa her istekte:
   - signed session token,
   - shop domain,
   - owner/shop kaydi
   birlikte dogrulanmali.
4. `dashboard/mapper` gibi public-route istisnalari tekrar incelenmeli.

### 1.5 Shopify mandatory compliance webhooks

Mevcut durum:
- GDPR endpoint var: `/api/webhooks/shopify/gdpr`
- Ancak repo'da `shopify.app.toml` yok.
- Shopify review otomatik kontrolleri compliance webhooks'u app config icinde bekler.

Uygulama:
1. Proje kokune `shopify.app.toml` ekle.
2. En az su compliance topics eklenmeli:
   - `customers/data_request`
   - `customers/redact`
   - `shop/redact`
3. App-specific webhooks olarak TOML ile deploy edilmeli.
4. HMAC gecersizse 401 veya Shopify checker'in bekledigi hata kodu donmeli; gecerliyse 200.
5. `shop/redact` sadece shop kaydini degil bagli tum tablolarin verilerini temizlemeli:
   - `notifications`
   - `shop_settings`
   - `sync_jobs`
   - `sync_logs`
   - staging tablolar
   - inventory tablolar
   - tokenlar ve shop kaydi
6. `app/uninstalled` aninda tokenlari revoke/scrub etmeli, webhook/cron tarafinda shop'u pasif yapmali.

### 1.6 Billing ve planlar netlestirilmeli

Karar verilmesi gereken paketler:
- Starter: dusuk urun limiti, temel sync, email support.
- Growth: daha yuksek urun limiti, realtime sync, fiyat kurallari.
- Pro: daha yuksek limit, priority support, gelismis sync.

Uygulama:
1. Tek plan kaynagi olustur:
   - `plans.ts` veya DB tablosu.
2. Pricing page, Billing tab ve Shopify billing API ayni plan config'ini kullanmali.
3. `plan_type` degerleri net olmali:
   - `pending`
   - `starter`
   - `growth`
   - `pro`
   - `cancelled`
4. Plan limitleri backend'de enforce edilmeli:
   - import edilebilir urun sayisi
   - connected Etsy shop sayisi
   - sync frekansi
   - price sync availability
5. Shopify billing test flow tamamlanmali:
   - install -> billing -> confirm -> dashboard
   - declined/cancelled billing -> friendly state

## 2. P1 - Core Sync Stabilitesi

### 2.1 Order flow tamamlanmali

Gereken davranis:
- Shopify order paid/created: Shopify zaten stok dusurur; inventory webhook ile Etsy'ye yeni stok gonderilmeli.
- Etsy order paid: Shopify stoklari secilen lokasyon siralamasina gore dusurulmeli.
- Etsy order canceled: daha once dusulen stok geri alinacak mi karar verilmeli.

Uygulama:
1. Etsy canceled event icin policy belirle:
   - Otomatik restore edilecekse receipt logundan onceki quantity bulunmali.
   - Restore edilmeyecekse UI/log bunu acik gostermeli.
2. Idempotency garanti edilmeli:
   - Ayni receipt/order iki kez gelirse stok iki kez dusmemeli.
3. Her order isleminde `sync_logs` net metadata yazmali:
   - source
   - receipt/order id
   - affected items
   - old/new stock
   - status/error

### 2.2 App uninstall cleanup

Mevcut `app/uninstalled` handler staging ve inventory silmeye calisiyor, ama kapsami eksik olabilir.

Uygulama:
1. Uninstall aninda:
   - shop `is_active=false`
   - Shopify/Etsy tokenlar null
   - cron/sync joblar durdurulmus kabul edilmeli
   - notification/email gonderimi durmali
2. `shop/redact` geldiginde:
   - tum shop verisi kalici silinmeli.
3. Reinstall senaryosu test edilmeli:
   - kullanici tekrar kurarsa temiz onboarding calismali.

### 2.3 Migration duzeni

Mevcut sorun:
- `supabase/migrations` ve `frontend/supabase_migrations` ayrismis.
- README eski ve sadece ilk 4 migration'i soyluyor.

Uygulama:
1. Tek migration kaynagi sec: `supabase/migrations`.
2. `frontend/supabase_migrations` icindeki gerekli SQL'leri numarali migration olarak ana klasore tasi.
3. README kurulum adimlarini guncelle.
4. Production DB ile repo migration'lari karsilastir.

## 3. P2 - Review ve Kalite Hazirligi

### 3.1 Lint/TypeScript temizligi

Mevcut kontrol:
- `npm run lint` 575 problem verdi.
- `npx tsc --noEmit` stale `.next` tipi nedeniyle hata verdi.

Uygulama:
1. `.next` temizlenip TypeScript check tekrar calistir.
2. Lint kurallari gercekci hale getir:
   - Ya strict kurallar kademeli acilsin,
   - ya da publish oncesi en az unused vars, build errors ve unsafe critical kodlar temizlensin.
3. CI ekle:
   - lint
   - typecheck
   - build

### 3.2 Review smoke test listesi

Shopify reviewer icin temiz akislari kaydet:
1. Install app.
2. Billing onayla.
3. Dashboard acilir.
4. Etsy connect.
5. Shopify/Etsy product import.
6. Product match.
7. Inventory stock degistir.
8. Karsi platformda stok guncellenir.
9. Notification bell ve email calisir.
10. App uninstall.
11. GDPR webhooks test edilir.

## 4. Resmi Kaynak Notlari

Shopify:
- App Store requirements: app core functionality production-ready, hatasiz ve guvenli olmali.
- Submit app review: compliance webhooks, app URLs ve API contact bilgileri review oncesi tamamlanmali.
- Mandatory compliance webhooks: `customers/data_request`, `customers/redact`, `shop/redact`.
- Webhook delivery HTTPS ve HMAC dogrulamasi gerektirir.

Etsy:
- Uygulama amaci onaylanmis olmali.
- App fully functional, tested, Application Purpose ile uyumlu olmali.
- Support email sunulmali.
- Application Terms ve Privacy Policy olmali.
- Etsy markasi icin endorsement/certification ima edilmemeli.
- Etsy API kullanan uygulama, Etsy tarafindan endorsed/certified olmadigini acikca belirtmeli.
- Etsy content cache/display kurallarina uyulmali.

## 5. Onerilen Uygulama Sirasi

1. Notification DB migration + unified notification service.
2. Email env/config + Resend production sender.
3. Etsy webhook ve token cron notification tetikleri.
4. Shopify auth/session guvenlik fix'i.
5. `shopify.app.toml` + compliance webhook deploy.
6. Uninstall/redact cleanup kapsam fix'i.
7. Billing plan config tekilleştirme.
8. Migration klasorlerini birlestirme.
9. Lint/typecheck/build smoke temizligi.
10. Shopify/Etsy basvuru dokumanlari ve demo hesabi hazirligi.

## 6. Basvuru Icin Hazirlanacak Metinler

### Etsy disclaimer

The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.

### Support

Support email: info@mercsync.com

### Kisa app aciklamasi

MercSync helps merchants keep matched Shopify and Etsy product inventory in sync. Merchants can import products, match or clone listings, track master stock, apply pricing rules, and receive inventory/sync notifications.

