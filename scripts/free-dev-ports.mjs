/**
 * Stops processes listening on common Next dev ports (stale node leaves .next locked → EPERM).
 * Windows: uses PowerShell. Other OS: best-effort lsof/kill.
 */
import { execFileSync, execSync } from 'child_process'

const PORTS = [3000, 3001, 3002, 3003, 3004, 3005]

function freeWindows() {
  const ports = PORTS.join(',')
  const ps = `
$ports = @(${ports})
foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop } catch {}
    }
}
`.trim()
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      stdio: 'inherit',
    })
    console.log('Freed listeners on ports', PORTS.join(', '))
  } catch {
    console.warn('Could not free ports (ignore if nothing was listening).')
  }
}

function freeUnix() {
  for (const port of PORTS) {
    try {
      const out = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim()
      for (const pid of out.split(/\s+/)) {
        if (pid) execSync(`kill -9 ${pid}`, { stdio: 'pipe' })
      }
    } catch {
      /* no listener */
    }
  }
  console.log('Attempted to free ports', PORTS.join(', '))
}

if (process.platform === 'win32') freeWindows()
else freeUnix()
