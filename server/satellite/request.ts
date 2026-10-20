import { z } from "zod"

const analysisWindowSchema = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
}).strict().superRefine((window, context) => {
  if (window.end < window.start) {
    context.addIssue({ code: "custom", message: "Window end must not precede its start." })
  }
  if (window.end > new Date().toISOString().slice(0, 10)) {
    context.addIssue({ code: "custom", message: "Analysis windows cannot end in the future." })
  }
})

export const analysisRequestSchema = z.object({
  watershedId: z.string().trim().min(1),
  type: z.enum(["NDVI", "NDWI", "Change detection"]),
  assetId: z.string().trim().min(1).optional(),
  baselineWindow: analysisWindowSchema.optional(),
  currentWindow: analysisWindowSchema.optional(),
  bufferM: z.number().int().min(50).max(5000).optional(),
}).strict().superRefine((input, context) => {
  if (Boolean(input.baselineWindow) !== Boolean(input.currentWindow)) {
    context.addIssue({
      code: "custom",
      message: "baselineWindow and currentWindow must be supplied together.",
    })
  }
  if (input.baselineWindow && input.currentWindow &&
      input.baselineWindow.end >= input.currentWindow.start) {
    context.addIssue({
      code: "custom",
      message: "The baseline window must end before the current window begins.",
    })
  }
})

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>
