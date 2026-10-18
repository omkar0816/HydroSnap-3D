const BASE = (process.env.BASE || "").replace(/\/$/, "")
const KEY = process.env.KEY || ""
if (!BASE || !KEY) { console.error("Set BASE and KEY first"); process.exit(1) }

const args = process.argv.slice(2)
const big = args.includes("--big")
const only = (args.find(a => a.startsWith("--only=")) || "")
  .replace("--only=", "").split(",").filter(Boolean)
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }

async function call(model, prompt) {
  const t = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 60000)
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST", headers, signal: ctl.signal,
      body: JSON.stringify({ model, max_tokens: 128, messages: [{ role: "user", content: prompt }] }),
    })
    const text = await r.text()
    let note = ""
    if (!r.ok) note = text.replace(/\s+/g, " ").slice(0, 110)
    else {
      try { if (!JSON.parse(text).choices?.[0]?.message?.content) note = "empty reply" }
      catch { note = "bad JSON" }
    }
    return { status: r.status, ms: Date.now() - t, note }
  } catch (e) {
    return { status: e.name === "AbortError" ? "timeout" : "error", ms: Date.now() - t, note: String(e.message).slice(0, 80) }
  } finally { clearTimeout(timer) }
}

let ids = only
if (!ids.length) {
  const r = await fetch(`${BASE}/models`, { headers })
  if (!r.ok) { console.error("Cannot list models. HTTP", r.status); process.exit(1) }
  ids = (await r.json()).data.map(m => m.id)
}

const small = "Reply with the single word OK."
const large = "Reply with the single word OK. Ignore the filler below.\n" +
  "The watershed was inspected near the village. ".repeat(1800) // roughly 20K tokens

for (const id of ids) {
  const a = await call(id, small)
  let line = `${String(a.status).padEnd(7)} ${String(a.ms).padStart(6)}ms  small`
  let note = a.note
  if (big && a.status === 200 && !a.note) {
    const b = await call(id, large)
    line += `  | big ${String(b.status).padEnd(7)} ${String(b.ms).padStart(6)}ms`
    note = b.note
  }
  console.log(`${line}  ${id}${note ? "  -> " + note : ""}`)
  await new Promise(r => setTimeout(r, 1000))
}