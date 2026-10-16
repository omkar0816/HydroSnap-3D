// HydroSnap AI photo evaluation runner.
// Usage:
//   pnpm install
//   pnpm evaluate:photos -- \
//        --labels eval/labels.csv --photos eval/photos \
//        --url https://hydrosnap-3d.vercel.app --out docs
//
// labels.csv columns: image_id,filename,licence_or_consent,ground_truth_label
// ground_truth_label must be one of the six closed labels.
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const LABELS = [
  "Check dam",
  "Farm pond",
  "Plantation",
  "Percolation tank",
  "not-a-watershed-asset",
  "unclear",
]
const argv = process.argv.slice(2).filter((value) => value !== "--")
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    "Usage: pnpm evaluate:photos -- --labels eval/labels.csv --photos eval/photos --url http://localhost:8443 --out docs",
  )
  process.exit(0)
}
const args = Object.fromEntries(
  argv.reduce((options, value, index, all) => {
    if (!value.startsWith("--")) return options
    const name = value.slice(2)
    if (!all[index + 1] || all[index + 1].startsWith("--")) {
      throw new Error(`Missing value for --${name}`)
    }
    options.push([name, all[index + 1]])
    return options
  }, []),
)
const labelsPath = args.labels ?? "eval/labels.csv"
const photosDir = args.photos ?? "eval/photos"
const baseUrl = (args.url ?? "http://localhost:3000").replace(/\/$/, "")
const outDir = args.out ?? "docs"
const delayMs = Number(args.delay ?? 6000) // Endpoint allows 12 req/min per IP.
if (!Number.isFinite(delayMs) || delayMs < 0)
  throw new Error("Delay must be a non-negative number.")

const parseCsvRow = (line) => {
  const cells = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"' && quoted && line[i + 1] === '"') {
      cell += '"'
      i++
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === "," && !quoted) {
      cells.push(cell.trim())
      cell = ""
    } else {
      cell += char
    }
  }
  if (quoted) throw new Error("Labels CSV contains an unclosed quoted field.")
  cells.push(cell.trim())
  return cells
}
const parseCsv = (text) => {
  const [header, ...lines] = text.trim().split(/\r?\n/)
  if (!header) throw new Error("Labels CSV is empty.")
  const columns = parseCsvRow(header)
  const required = [
    "image_id",
    "filename",
    "licence_or_consent",
    "ground_truth_label",
  ]
  if (required.some((name) => !columns.includes(name))) {
    throw new Error(`Labels CSV must include: ${required.join(", ")}`)
  }
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvRow(line)
    if (values.length !== columns.length) {
      throw new Error(
        "Labels CSV row has a different number of fields than its header.",
      )
    }
    return Object.fromEntries(
      columns.map((column, index) => [column, values[index]]),
    )
  })
}
const rows = parseCsv(fs.readFileSync(labelsPath, "utf8"))
for (const r of rows) {
  if (!LABELS.includes(r.ground_truth_label))
    throw new Error(`Bad label for ${r.image_id}: "${r.ground_truth_label}"`)
  if (!r.licence_or_consent)
    throw new Error(`Missing licence/consent for ${r.image_id}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
for (const [i, row] of rows.entries()) {
  // Same preprocessing as the app: longest side 1024px, JPEG q≈82, metadata stripped.
  const jpeg = await sharp(path.join(photosDir, row.filename))
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
  let pred = "request-failed",
    conf = "",
    note = ""
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/photo-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: baseUrl },
        body: JSON.stringify({
          imageBase64: jpeg.toString("base64"),
          mimeType: "image/jpeg",
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status === 429 && attempt < 2) {
        await sleep(65_000)
        continue
      }
      if (res.ok) {
        const body = await res.json()
        if (
          !LABELS.includes(body.predictedClass) ||
          typeof body.confidence !== "number"
        ) {
          note = "Invalid API response"
        } else {
          pred = body.predictedClass
          conf = body.confidence
          note = body.modelName
        }
      } else {
        let code = ""
        try {
          const body = await res.json()
          if (typeof body.code === "string") code = ` ${body.code}`
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error
          code = " invalid-error-response"
        }
        note = `HTTP ${res.status}${code}`
      }
      break
    } catch (error) {
      note = error instanceof Error ? error.message : "Network request failed"
      break
    }
  }
  results.push({
    ...row,
    predicted_label: pred,
    confidence: conf,
    correct: pred === row.ground_truth_label ? "yes" : "no",
    review_notes: note,
  })
  console.log(
    `[${i + 1}/${rows.length}] ${row.image_id}: truth=${row.ground_truth_label} pred=${pred} (${conf})`,
  )
  await sleep(delayMs)
}

// Confusion matrix: rows = ground truth, columns = prediction.
const cols = [...LABELS, "request-failed"]
const m = Object.fromEntries(
  LABELS.map((t) => [t, Object.fromEntries(cols.map((c) => [c, 0]))]),
)
for (const r of results) m[r.ground_truth_label][r.predicted_label] += 1
const completed = results.filter((r) => LABELS.includes(r.predicted_label))
const correct = completed.filter((r) => r.correct === "yes").length
// Practical metric: for negatives, how many were NOT accepted as a real asset?
const negatives = results.filter(
  (r) => r.ground_truth_label === "not-a-watershed-asset",
)
const negCaught = negatives.filter((r) =>
  ["not-a-watershed-asset", "unclear"].includes(r.predicted_label),
).length

let md = `| Ground truth \\ Prediction | ${cols.join(" | ")} | Support | Recall |\n|---|${cols.map(() => "---:").join("|")}|---:|---:|\n`
for (const t of LABELS) {
  const support = results.filter((r) => r.ground_truth_label === t).length
  md += `| ${t} | ${cols.map((c) => m[t][c]).join(" | ")} | ${support} | ${
    support ? ((m[t][t] / support) * 100).toFixed(0) + "%" : "n/a"
  } |\n`
}
md += `\n**Overall accuracy:** ${correct}/${completed.length} completed predictions (${
  completed.length
    ? ((correct / completed.length) * 100).toFixed(1) + "%"
    : "n/a"
})\n`
md += `\n**Requests not completed:** ${results.length - completed.length}/${results.length}\n`
md += `\n**Negatives not accepted as an asset:** ${negCaught}/${negatives.length}\n`
md += `\n**Run:** ${new Date().toISOString().slice(0, 10)} · endpoint ${baseUrl} · model ${results.find((r) => LABELS.includes(r.predicted_label))?.review_notes ?? "unknown"}\n`

fs.mkdirSync(outDir, { recursive: true })
const header =
  "image_id,licence_or_consent,ground_truth_label,predicted_label,confidence,correct,review_notes"
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`
fs.writeFileSync(
  path.join(outDir, "AI_PHOTO_EVALUATION_RESULTS.csv"),
  [
    header,
    ...results.map((r) =>
      header
        .split(",")
        .map((k) => csvEscape(r[k]))
        .join(","),
    ),
  ].join("\n") + "\n",
)
fs.writeFileSync(path.join(outDir, "AI_PHOTO_EVALUATION_RESULTS.md"), md)
console.log("\n" + md)
