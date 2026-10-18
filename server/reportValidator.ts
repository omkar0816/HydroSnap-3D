import type {
  ReportClaims,
  ReportFact,
  ReportFacts,
} from "../src/services/reportFacts.ts"

export function convertDevanagariToAscii(str: string): string {
  return str.replace(/[\u0966-\u096F]/g, (ch) =>
    String(ch.charCodeAt(0) - 0x0966),
  )
}

export function maskExemptTokens(text: string): string {
  let cleaned = text
  // Strip [F#] markers: e.g. [F1], [F12], [f2]
  cleaned = cleaned.replace(/\[F\d+\]/gi, " ")
  // Strip satellite/sensor names like Sentinel-2, Sentinel-2A, Landsat 8/9, Landsat-8, Landsat 9
  cleaned = cleaned.replace(/Sentinel\s*-\s*\d+[a-zA-Z]*/gi, " ")
  cleaned = cleaned.replace(/Landsat\s*[-/]?\s*\d+(?:\s*[/]\s*\d+)?/gi, " ")
  return cleaned
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function maskAllowedDatesAndYears(text: string, facts: ReportFact[]): string {
  let cleaned = text
  const allowedYears = new Set<string>()
  const allowedFullDates = new Set<string>()

  for (const fact of facts) {
    const fields = [fact.observedAt, fact.label, fact.unit].filter(Boolean) as string[]
    for (const field of fields) {
      const ascii = convertDevanagariToAscii(field)
      const fullDates = ascii.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g)
      if (fullDates) {
        fullDates.forEach((d) => allowedFullDates.add(d))
      }
      const years = ascii.match(/\b(19\d{2}|20\d{2})\b/g)
      if (years) {
        years.forEach((y) => allowedYears.add(y))
      }
    }
  }

  for (const dateStr of allowedFullDates) {
    const escaped = escapeRegExp(dateStr)
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ")
  }

  for (const year of allowedYears) {
    cleaned = cleaned.replace(new RegExp(`\\b${year}\\b`, "g"), " ")
  }

  return cleaned
}

export interface ExtractedNumber {
  raw: string
  numStr: string
  value: number
  isPercent: boolean
  decimals: number
}

export function extractNumbers(text: string): ExtractedNumber[] {
  const results: ExtractedNumber[] = []
  const regex = /(?:^|[^\w\u0900-\u097F+-])([+-]?(?:\d+\.\d+|\d+|\.\d+))(\s*%)?(?=[^\w\u0900-\u097F]|$)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const numStr = match[1]
    const percentStr = match[2]
    const isPercent = Boolean(percentStr && percentStr.includes("%"))
    const val = Number(numStr)
    if (!Number.isFinite(val)) continue
    const dotIdx = numStr.indexOf(".")
    const decimals = dotIdx >= 0 ? numStr.length - dotIdx - 1 : 0
    results.push({
      raw: match[0].trim(),
      numStr,
      value: val,
      isPercent,
      decimals,
    })
  }
  return results
}

function roundToDecimals(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  const sign = val < 0 ? -1 : 1
  return (sign * Math.round(Math.abs(val) * factor + Number.EPSILON)) / factor
}

function numbersMatch(a: number, b: number, decimals: number): boolean {
  return Math.abs(a - b) < 1e-7 || a.toFixed(decimals) === b.toFixed(decimals)
}

function factMatchesClaimNumber(
  fact: ReportFact,
  factNum: number,
  claimNum: ExtractedNumber,
): boolean {
  const d = claimNum.decimals

  // Direct match
  if (!claimNum.isPercent) {
    const rounded = roundToDecimals(factNum, d)
    if (numbersMatch(rounded, claimNum.value, d)) {
      return true
    }
  }

  // Claim is percent (e.g. 42%), fact is fraction (e.g. 0.42) or fact already in percent
  if (claimNum.isPercent) {
    const factAsPercent = factNum * 100
    const roundedPercent = roundToDecimals(factAsPercent, d)
    if (numbersMatch(roundedPercent, claimNum.value, d)) {
      return true
    }
    const roundedDirect = roundToDecimals(factNum, d)
    if (numbersMatch(roundedDirect, claimNum.value, d)) {
      return true
    }
  }

  // Claim is fraction (e.g. 0.42), fact is percent with % in unit (e.g. value 42, unit "%")
  if (!claimNum.isPercent && fact.unit?.includes("%")) {
    const factAsFraction = factNum / 100
    const roundedFraction = roundToDecimals(factAsFraction, d)
    if (numbersMatch(roundedFraction, claimNum.value, d)) {
      return true
    }
  }

  return false
}

export function validateClaims(
  claims: ReportClaims,
  facts: ReportFacts,
): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const factMap = new Map<string, ReportFact>()
  for (const f of facts.facts) {
    factMap.set(f.id, f)
  }

  for (let i = 0; i < claims.claims.length; i++) {
    const claim = claims.claims[i]
    const claimIndexLabel = `Claim #${i + 1}`

    // 1. Must cite at least one fact
    if (!claim.factIds || claim.factIds.length === 0) {
      errors.push(`${claimIndexLabel} cites no facts: "${claim.text}"`)
      continue
    }

    // 2. Check for unknown fact IDs
    const citedFacts: ReportFact[] = []
    let hasUnknownFact = false
    for (const factId of claim.factIds) {
      const fact = factMap.get(factId)
      if (!fact) {
        errors.push(`${claimIndexLabel} cites unknown factId "${factId}": "${claim.text}"`)
        hasUnknownFact = true
      } else {
        citedFacts.push(fact)
      }
    }
    if (hasUnknownFact) continue

    // 3. Demo fact check: claim must say it is demo data
    const citesDemoFact = citedFacts.some((f) => f.status === "demo")
    if (citesDemoFact && !/\bdemo\b/i.test(claim.text)) {
      errors.push(
        `${claimIndexLabel} cites demo fact but does not state it is demo data: "${claim.text}"`,
      )
    }

    // 4. Clean text: Devanagari to ASCII, mask exempt tokens ([F#], Sentinel-2, Landsat 8/9)
    const asciiText = convertDevanagariToAscii(claim.text)
    const maskedExempt = maskExemptTokens(asciiText)

    // 5. No-data fact check: a claim that cites a no-data fact and contains any number must FAIL
    const citesNoDataFact = citedFacts.some((f) => f.status === "no-data")
    if (citesNoDataFact) {
      const allExtractedNumbers = extractNumbers(maskedExempt)
      if (allExtractedNumbers.length > 0) {
        errors.push(
          `${claimIndexLabel} cites a no-data fact and contains numeric values: "${claim.text}"`,
        )
        continue
      }
    }

    // 6. Mask allowed dates/years
    const maskedDates = maskAllowedDatesAndYears(maskedExempt, citedFacts)

    // 7. Extract remaining numbers
    const numbersInClaim = extractNumbers(maskedDates)

    // 8. Match each number in claim against cited facts
    for (const claimNum of numbersInClaim) {
      let matched = false
      for (const fact of citedFacts) {
        if (fact.value === null || fact.value === undefined) continue
        const factNum = typeof fact.value === "number" ? fact.value : Number(fact.value)
        if (!Number.isFinite(factNum)) continue

        if (factMatchesClaimNumber(fact, factNum, claimNum)) {
          matched = true
          break
        }
      }

      if (!matched) {
        errors.push(
          `${claimIndexLabel} contains number ${claimNum.raw} which does not match any cited fact value: "${claim.text}"`,
        )
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

export function renderTemplateReport(facts: ReportFacts): string {
  const lines: string[] = []
  lines.push(`Report for ${facts.subject} (generated ${facts.generatedAt}):`)
  for (const f of facts.facts) {
    const obsPart = f.observedAt ? ` (observed ${f.observedAt})` : ""
    if (f.status === "no-data") {
      lines.push(`- [${f.id}] ${f.label}: No data recorded (source: ${f.source}).`)
    } else if (f.status === "demo") {
      const valStr = f.value !== null ? `${f.value}${f.unit ? ` ${f.unit}` : ""}` : "No value"
      lines.push(
        `- [${f.id}] ${f.label}: ${valStr}${obsPart} (demo data, source: ${f.source}).`,
      )
    } else {
      const valStr = f.value !== null ? `${f.value}${f.unit ? ` ${f.unit}` : ""}` : "No value"
      lines.push(`- [${f.id}] ${f.label}: ${valStr}${obsPart} (source: ${f.source}).`)
    }
  }
  return lines.join("\n")
}

