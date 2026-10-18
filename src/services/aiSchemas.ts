import { z } from "zod"

const summarySceneSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    cloudCover: z.number().nullable(),
  })
  .strict()

const summaryWindowSchema = z
  .object({
    window: z.string(),
    scenes: z.array(summarySceneSchema),
    nearMean: z.number().nullable(),
    controlMean: z.number().nullable(),
    validNearPixels: z.number().int().nonnegative(),
    validControlPixels: z.number().int().nonnegative(),
  })
  .strict()

const summaryMetricSchema = z
  .object({
    name: z.string(),
    definition: z.string(),
    before: summaryWindowSchema,
    after: summaryWindowSchema,
    nearChange: z.number().nullable(),
    controlChange: z.number().nullable(),
    differenceInDifferences: z.number().nullable(),
  })
  .strict()

export const pilotSummaryFactsSchema = z
  .object({
    status: z.enum(["pipeline-test", "no-data", "no-clear-signal"]),
    label: z.literal("Pipeline test, not a real result"),
    interpretation: z.string().max(1000),
    metrics: z.array(summaryMetricSchema).length(2),
  })
  .strict()

export const aiPilotSummaryTextSchema = z
  .object({
    english: z.string().min(1).max(900),
    hindi: z.string().min(1).max(900),
    marathi: z.string().min(1).max(900),
  })
  .strict()
