import { jsPDF } from "jspdf"
import type { Map as MapLibreMap } from "maplibre-gl"
import type {
  Asset,
  FieldObservation,
  PilotAnalysis,
  Watershed,
} from "@/types/domain"
import { sha256Hex } from "@/utils/trust"

export interface AssetReportInput {
  asset: Asset
  watershed?: Watershed
  observations: FieldObservation[]
  pilotAnalysis?: PilotAnalysis | null
  mapSnapshot: string
}

export function captureMapSnapshot(map: MapLibreMap): Promise<string> {
  return new Promise((resolve, reject) => {
    const onRender = () => {
      map.off("render", onRender)
      try {
        resolve(map.getCanvas().toDataURL("image/png"))
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Could not capture the map image."),
        )
      }
    }
    map.once("render", onRender)
    try {
      map.triggerRepaint()
    } catch (error) {
      map.off("render", onRender)
      reject(
        error instanceof Error
          ? error
          : new Error("Could not request a map render."),
      )
    }
  })
}

export async function createAssetInspectionPdf(
  input: AssetReportInput,
): Promise<jsPDF> {
  const reportBundle = {
    version: 1,
    generatedAt: new Date().toISOString(),
    asset: input.asset,
    watershed: input.watershed,
    observations: input.observations.map(({ imageDataUrl: _image, ...record }) =>
      record,
    ),
    pilotAnalysis: input.pilotAnalysis,
  }
  const bundleHash = await sha256Hex(
    new Blob([JSON.stringify(reportBundle)], { type: "application/json" }),
  )
  if (!bundleHash) {
    throw new Error("SHA-256 is unavailable; the audited PDF was not created.")
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 18) return
    pdf.addPage()
    y = margin
  }
  const heading = (text: string) => {
    ensureSpace(11)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(14)
    pdf.setTextColor(18, 59, 99)
    pdf.text(text, margin, y)
    y += 8
  }
  const line = (text: string, size = 9) => {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(size)
    pdf.setTextColor(45, 63, 77)
    const wrapped = pdf.splitTextToSize(text, pageWidth - margin * 2)
    ensureSpace(wrapped.length * (size * 0.48) + 3)
    pdf.text(wrapped, margin, y)
    y += wrapped.length * (size * 0.48) + 3
  }

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(20)
  pdf.setTextColor(18, 59, 99)
  pdf.text("HydroSnap 3D · Asset inspection", margin, y)
  y += 9
  line("Audited field-inspection report · prototype output", 9)
  heading("Asset")
  line(`${input.asset.name} · ${input.asset.type} · ${input.asset.status}`)
  line(
    `Watershed: ${input.watershed?.name ?? input.asset.watershedId}${input.watershed?.demo ? " (Demo boundary)" : ""}`,
  )
  line(`Village: ${input.asset.village || "Not recorded"}`)
  line(
    `Location: ${input.asset.location.coordinates[1].toFixed(6)}, ${input.asset.location.coordinates[0].toFixed(6)} (WGS84)`,
  )
  line(`Last inspected: ${input.asset.lastInspected}`)
  if (input.asset.location.source === "demo") {
    line("DEMO ASSET: location and identity are illustrative, not field-verified.")
  }

  heading("Map snapshot")
  ensureSpace(84)
  pdf.addImage(
    input.mapSnapshot,
    "PNG",
    margin,
    y,
    pageWidth - margin * 2,
    76,
  )
  y += 81

  heading(`Photo timeline (${input.observations.length} observation${input.observations.length === 1 ? "" : "s"})`)
  if (!input.observations.length) line("No linked field photos are recorded.")
  for (const observation of input.observations) {
    ensureSpace(47)
    const imageData = observation.imageDataUrl
      ? await imageAsJpeg(observation.imageDataUrl)
      : undefined
    if (imageData) {
      pdf.addImage(imageData, "JPEG", margin, y, 43, 34)
    }
    const textX = imageData ? margin + 48 : margin
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(9)
    pdf.setTextColor(45, 63, 77)
    pdf.text(
      pdf.splitTextToSize(
        `${observation.inspectionDate} · ${observation.imageName}`,
        pageWidth - textX - margin,
      ),
      textX,
      y + 4,
    )
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(8)
    const metadata = [
      `Status: ${observation.verificationStatus}`,
      `SHA-256: ${observation.imageSha256 ?? "Unavailable"}`,
      `EXIF: ${
        observation.exif?.hasGps ? "GPS present" : "No GPS"
      }${observation.exif?.takenAt ? ` · ${observation.exif.takenAt}` : ""}${
        observation.exif?.make || observation.exif?.model
          ? ` · ${[observation.exif.make, observation.exif.model].filter(Boolean).join(" ")}`
          : ""
      }`,
    ]
    pdf.text(
      pdf.splitTextToSize(
        metadata.join("\n"),
        pageWidth - textX - margin,
      ),
      textX,
      y + 10,
    )
    y += 39
    for (const reason of observation.trust?.reasons ?? []) {
      line(`Trust ${reason.severity}: ${reason.message}`, 8)
    }
    for (const event of observation.auditHistory) {
      line(
        `${event.timestamp} · ${event.actor}: ${event.action}`,
        7.5,
      )
    }
    y += 3
  }

  heading("Satellite comparison")
  if (!input.pilotAnalysis) {
    line("No satellite analysis is available for this asset.")
  } else {
    line(input.pilotAnalysis.label)
    line(input.pilotAnalysis.interpretation)
    line(`Source: ${input.pilotAnalysis.source}`)
    for (const metric of [
      input.pilotAnalysis.indices.ndvi,
      input.pilotAnalysis.indices.ndwi,
    ]) {
      line(`${metric.name}: ${metric.definition}`)
      line(
        `Before ${metric.before.window}: ${metric.before.scenes.length} scenes; near ${formatValue(metric.before.nearMean)}, control ${formatValue(metric.before.controlMean)}.`,
      )
      line(
        `After ${metric.after.window}: ${metric.after.scenes.length} scenes; near ${formatValue(metric.after.nearMean)}, control ${formatValue(metric.after.controlMean)}.`,
      )
      line(
        `Near change ${formatValue(metric.nearChange)} · control change ${formatValue(metric.controlChange)} · difference-in-differences ${formatValue(metric.differenceInDifferences)}.`,
      )
      for (const scene of [...metric.before.scenes, ...metric.after.scenes]) {
        line(
          `Scene ${scene.id} · ${scene.date} · cloud ${
            scene.cloudCover === null
              ? "unknown"
              : `${scene.cloudCover.toFixed(1)}%`
          }`,
          7.5,
        )
      }
    }
    line(`Attribution: ${input.pilotAnalysis.attribution}`)
    line("Demo-coordinate pipeline test only; this is not evidence of impact.")
  }

  const pageCount = pdf.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(7)
    pdf.setTextColor(105, 121, 135)
    pdf.text(
      `JSON bundle SHA-256: ${bundleHash}`,
      margin,
      pageHeight - 8,
      { maxWidth: pageWidth - margin * 2 - 15 },
    )
    pdf.text(`${page}/${pageCount}`, pageWidth - margin, pageHeight - 8, {
      align: "right",
    })
  }
  return pdf
}

function formatValue(value: number | null): string {
  return value === null ? "not available" : value.toFixed(3)
}

async function imageAsJpeg(dataUrl: string): Promise<string> {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () =>
      reject(new Error("Could not read a field photo for the PDF."))
    image.src = dataUrl
  })
  const scale = Math.min(
    1,
    1200 / Math.max(image.naturalWidth, image.naturalHeight),
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Could not prepare a field photo for the PDF.")
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.82)
}
