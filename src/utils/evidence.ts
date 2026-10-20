import type { Asset } from "@/types/domain"
import type { FieldObservation } from "@/types/domain"
import { env } from "@/config/env"
import type { WatershedEvidence } from "@/types/evidence"

export function evidenceAssetsToAssets(evidence?: WatershedEvidence): Asset[] {
  return (evidence?.assets ?? []).map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type as Asset["type"],
    watershedId: evidence!.watershed.id,
    location: {
      type: "Point",
      coordinates: [asset.lng, asset.lat],
      source: asset.demo ? "demo" : "manual",
    },
    status: asset.status as Asset["status"],
    lastInspected: "",
    installedAt: asset.installedAt ?? undefined,
    village: asset.village ?? "",
    description: asset.description ?? "",
  }))
}

export function evidenceObservationsToFieldObservations(
  evidence?: WatershedEvidence,
): FieldObservation[] {
  if (!evidence) return []
  return evidence.observations.map((observation) => ({
    id: observation.id,
    assetId: observation.assetId ?? undefined,
    watershedId: evidence.watershed.id,
    assetType: (observation.assetType ?? "Check dam") as FieldObservation["assetType"],
    imageName: observation.hasImage ? "Field photo" : "No image",
    ...(observation.hasImage
      ? {
          imageDataUrl: `${env.apiBaseUrl.replace(/\/$/, "")}/api/v1/uploads/${encodeURIComponent(observation.id)}/photo`,
        }
      : {}),
    location: {
      type: "Point",
      coordinates: [observation.lng, observation.lat],
      source: "manual",
    },
    village: observation.village,
    description: observation.description,
    inspectionDate: observation.inspectionDate ?? "",
    officerId: observation.officerId ?? "",
    officerName: "",
    verificationStatus: observation.verificationStatus as FieldObservation["verificationStatus"],
    createdAt: observation.recordedAt,
    auditHistory: [],
    ...(observation.imageSha256 ? { imageSha256: observation.imageSha256 } : {}),
    ...(observation.trust && typeof observation.trust === "object"
      ? { trust: observation.trust as FieldObservation["trust"] }
      : {}),
    ...(observation.snapDistanceMeters !== null
      ? { snapDistanceMeters: observation.snapDistanceMeters }
      : {}),
    ...(observation.photoContentReview && typeof observation.photoContentReview === "object"
      ? { photoContentReview: observation.photoContentReview as FieldObservation["photoContentReview"] }
      : {}),
  }))
}