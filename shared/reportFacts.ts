import { z } from "zod"

export const reportFactStatusSchema = z.enum(["measured", "no-data", "demo"])
export type ReportFactStatus = z.infer<typeof reportFactStatusSchema>

export const reportFactKindSchema = z.enum(["count", "measurement", "trend", "coverage"])
export type ReportFactKind = z.infer<typeof reportFactKindSchema>

export const reportFactSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    value: z.union([z.string(), z.number(), z.null()]),
    unit: z.string().optional(),
    source: z.string().min(1),
    observedAt: z.string().optional(),
    status: reportFactStatusSchema,
    recordIds: z.array(z.string()),
    kind: reportFactKindSchema,
  })
  .strict()
export type ReportFact = z.infer<typeof reportFactSchema>

export const reportFactsSchema = z
  .object({
    subject: z.string().min(1),
    generatedAt: z.string().min(1),
    facts: z.array(reportFactSchema),
  })
  .strict()
export type ReportFacts = z.infer<typeof reportFactsSchema>

export const reportClaimSchema = z
  .object({
    text: z.string().min(1),
    factIds: z.array(z.string().min(1)),
  })
  .strict()
export type ReportClaim = z.infer<typeof reportClaimSchema>

export const reportClaimsSchema = z
  .object({
    claims: z.array(reportClaimSchema),
  })
  .strict()
export type ReportClaims = z.infer<typeof reportClaimsSchema>

export type DataGap = {
  code: string
  severity: "info" | "warning" | "critical"
  text: string
}

export type SavedWatershedReport = {
  id: string
  watershedId: string
  createdBy: string
  createdAt: string
  factSet: ReportFacts
  factSetSha256: string
  claims: ReportClaims
  gaps: DataGap[]
  renderedMarkdown: string
  model: string | null
  validatorVersion: string
  language: "en" | "hi" | "mr"
}
