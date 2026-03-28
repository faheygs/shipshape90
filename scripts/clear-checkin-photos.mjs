/**
 * Empty the `checkin-photos` Storage bucket via the Storage API.
 * Supabase blocks DELETE on storage.objects in SQL — use this before reset-all-data.sql.
 *
 * Usage (from shipshape90 folder):
 *   Put NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (service role: Dashboard → API).
 *   npm run clear-storage
 *   (This script loads .env.local if those vars are not already set in the shell.)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Minimal .env.local loader (no extra deps); shell env wins over file. */
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'checkin-photos'

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Add the service role key from Supabase Dashboard → Settings → API (keep it secret).')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** List all file paths under `path` (folders have metadata null in list responses). */
async function collectFilePaths(path = '') {
  const { data, error } = await supabase.storage.from(BUCKET).list(path, { limit: 1000 })
  if (error) throw error

  const out = []
  for (const item of data || []) {
    const prefix = path ? `${path}/${item.name}` : item.name
    const isFile = item.metadata != null
    if (isFile) {
      out.push(prefix)
    } else {
      const nested = await collectFilePaths(prefix)
      out.push(...nested)
    }
  }
  return out
}

async function main() {
  console.log(`Listing objects in "${BUCKET}"…`)
  const paths = await collectFilePaths()
  if (paths.length === 0) {
    console.log('Bucket is already empty.')
    return
  }
  console.log(`Removing ${paths.length} object(s)…`)
  const batchSize = 100
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize)
    const { error } = await supabase.storage.from(BUCKET).remove(batch)
    if (error) throw error
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
