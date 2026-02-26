
import { createAdminClient } from '../frontend/utils/supabase/admin'
import 'dotenv/config'

// Load env from frontend/.env.local manually since we are running from root
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const envPath = path.resolve(__dirname, '../frontend/.env.local')
dotenv.config({ path: envPath })

async function inspect() {
    try {
        console.log('Connecting to Supabase...')
        const supabase = createAdminClient()

        console.log('Fetching one shop...')
        const { data, error } = await supabase
            .from('shops')
            .select('*')
            .limit(1)

        if (error) {
            console.error('Error fetching shop:', error)
            return
        }

        if (!data || data.length === 0) {
            console.log('No shops found to inspect.')
            // Fallback: try to insert a dummy to see error? No, that's risky.
            // Just print that we can't see columns if no rows.
            // Actually, we can use an RPC or just assume if no error, the table exists.
            // But we need columns.

            // Let's try to select specific column 'initial_product_counts' to see if it errors
            const { error: colError } = await supabase
                .from('shops')
                .select('initial_product_counts')
                .limit(1)

            if (colError) {
                console.log('Column initial_product_counts likely DOES NOT exist:', colError.message)
            } else {
                console.log('Column initial_product_counts EXISTS (select query worked).')
            }
            return
        }

        const shop = data[0]
        console.log('Shop columns found:', Object.keys(shop))

        if ('initial_product_counts' in shop) {
            console.log('✅ initial_product_counts FOUND!')
            console.log('Value type:', typeof shop.initial_product_counts)
            console.log('Value:', shop.initial_product_counts)
        } else {
            console.log('❌ initial_product_counts NOT found in returned row.')
        }

    } catch (e) {
        console.error('Script error:', e)
    }
}

inspect()
