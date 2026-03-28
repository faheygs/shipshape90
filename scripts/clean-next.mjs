/**
 * Remove Next.js caches (Windows-safe, no rimraf dependency).
 * Use when dev hangs, EPERM on .next, or after moving the repo.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function rm(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true })
    console.log('Removed', path.relative(root, p) || '.')
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.warn('Skip', p, e.message)
  }
}

rm(path.join(root, '.next'))
rm(path.join(root, 'node_modules', '.cache'))
