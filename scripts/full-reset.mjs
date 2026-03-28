/**
 * Full wipe: empty `checkin-photos` bucket + delete every Auth user (profiles + app data CASCADE).
 * Loads `.env.local` the same way as clear-checkin-photos.mjs.
 *
 *   npm run reset-db
 *
 * Needs: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function collectFilePaths(prefix = '') {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw error
  const out = []
  for (const item of data || []) {
    const p = prefix ? `${prefix}/${item.name}` : item.name
    const isFile = item.metadata != null
    if (isFile) out.push(p)
    else out.push(...(await collectFilePaths(p)))
  }
  return out
}

async function emptyBucket() {
  console.log(`[1/2] Storage: listing "${BUCKET}"…`)
  const paths = await collectFilePaths()
  if (paths.length === 0) {
    console.log('      Bucket already empty.')
    return
  }
  console.log(`      Removing ${paths.length} object(s)…`)
  const batchSize = 100
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize)
    const { error } = await supabase.storage.from(BUCKET).remove(batch)
    if (error) throw error
  }
  console.log('      Done.')
}

async function deleteAllAuthUsers() {
  console.log('[2/2] Auth: deleting all users (profiles + related rows CASCADE)…')
  let total = 0
  let page = 1
  const perPage = 1000
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data.users || []
    if (users.length === 0) break
    for (const u of users) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id)
      if (delErr) throw delErr
      total += 1
    }
    if (users.length < perPage) break
    page += 1
  }
  console.log(`      Removed ${total} user account(s).`)
}

async function main() {
  await emptyBucket()
  await deleteAllAuthUsers()
  console.log('Full reset finished.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
