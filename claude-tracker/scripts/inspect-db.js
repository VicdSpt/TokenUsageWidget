/* Diagnostic: dump what the widget's DB actually contains vs what the raw
   JSONL files say, for the 5h and 7d windows. Run with the Electron binary
   in run-as-node mode so the ABI matches the better-sqlite3 build:
   ELECTRON_RUN_AS_NODE=1 node_modules\electron\dist\electron.exe scripts\inspect-db.js */
const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const os = require('os')

const dbPath = path.join(process.env.APPDATA, 'claude-tracker', 'tracker.db')
const db = new Database(dbPath, { readonly: true })

const now = Date.now()
const fiveHAgo = now - 5 * 60 * 60 * 1000
const sevenDAgo = now - 7 * 24 * 60 * 60 * 1000

console.log('=== NOW:', new Date(now).toISOString(), '===\n')

// --- What the widget computes ---
const sessionRow = db.prepare(
  'SELECT COALESCE(SUM(tokens_in + tokens_out),0) t, COUNT(*) n FROM sessions WHERE created_at >= ?'
).get(fiveHAgo)
console.log('[WIDGET] sessions table, created_at >= 5h ago:', sessionRow.t, 'tokens in', sessionRow.n, 'rows')

const weeklyRows = db.prepare(
  'SELECT date, sessions_count, tokens_in, tokens_out FROM daily_stats WHERE date >= ? ORDER BY date'
).all(new Date(sevenDAgo).toISOString().slice(0, 10))
let weeklyTotal = 0
for (const r of weeklyRows) {
  weeklyTotal += r.tokens_in + r.tokens_out
  console.log(`[WIDGET] daily_stats ${r.date}: in=${r.tokens_in} out=${r.tokens_out} sessions=${r.sessions_count}`)
}
console.log('[WIDGET] weekly total:', weeklyTotal, '\n')

// All session rows in last 24h to see created_at distribution
const recent = db.prepare(
  'SELECT id, date, created_at, tokens_in, tokens_out, messages_count FROM sessions WHERE created_at >= ? ORDER BY created_at'
).all(now - 24 * 3600 * 1000)
console.log('[WIDGET] session rows last 24h:')
for (const r of recent) {
  console.log(`  #${r.id} ${new Date(r.created_at).toISOString()} in=${r.tokens_in} out=${r.tokens_out} msgs=${r.messages_count}`)
}

const meta = db.prepare('SELECT key, value FROM meta').all()
console.log('\n[WIDGET] meta:', JSON.stringify(meta))

// --- What the raw JSONL says ---
const projectsDir = path.join(os.homedir(), '.claude', 'projects')
let raw5h = { in: 0, out: 0, msgs: 0 }
let raw7d = { in: 0, out: 0, msgs: 0 }
for (const proj of fs.readdirSync(projectsDir)) {
  const projPath = path.join(projectsDir, proj)
  if (!fs.statSync(projPath).isDirectory()) continue
  for (const file of fs.readdirSync(projPath)) {
    if (!file.endsWith('.jsonl')) continue
    // skip huge files older than 7d by mtime to keep this fast
    const full = path.join(projPath, file)
    if (fs.statSync(full).mtimeMs < sevenDAgo) continue
    for (const line of fs.readFileSync(full, 'utf-8').split('\n')) {
      if (!line.trim()) continue
      let obj
      try { obj = JSON.parse(line) } catch { continue }
      const ts = new Date(obj.timestamp).getTime()
      if (isNaN(ts) || ts < sevenDAgo) continue
      const usage = obj.message && obj.message.usage
      if (!usage) continue
      const ti = usage.input_tokens || 0
      const to = usage.output_tokens || 0
      raw7d.in += ti; raw7d.out += to; raw7d.msgs++
      if (ts >= fiveHAgo) { raw5h.in += ti; raw5h.out += to; raw5h.msgs++ }
    }
  }
}
console.log('\n[RAW JSONL] last 5h :', raw5h.in + raw5h.out, `tokens (in=${raw5h.in} out=${raw5h.out}, ${raw5h.msgs} msgs)`)
console.log('[RAW JSONL] last 7d :', raw7d.in + raw7d.out, `tokens (in=${raw7d.in} out=${raw7d.out}, ${raw7d.msgs} msgs)`)

console.log('\n[LIMITS] pro: session 88k weekly 440k')
console.log('  widget session % =', Math.round(sessionRow.t / 88000 * 100))
console.log('  widget weekly  % =', Math.round(weeklyTotal / 440000 * 100))
console.log('  raw     session % =', Math.round((raw5h.in + raw5h.out) / 88000 * 100))
console.log('  raw     weekly  % =', Math.round((raw7d.in + raw7d.out) / 440000 * 100))
