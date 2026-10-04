import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import exifr from "exifr"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Crosshair,
  FileImage,
  LoaderCircle,
  MapPin,
  Navigation,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react"
import { Link } from "react-router-dom"
import { AppContext } from "@/App"
import { WatershedMap } from "@/components/maps/WatershedMap"
import { useHydroSnap } from "@/hooks/useHydroSnap"
import { TrustPanel } from "@/components/evidence/TrustPanel"
import {
  distanceMeters,
  findContainingWatershed,
  nearestStreamPoint,
  toGeoLocation,
} from "@/utils/geo"
import { assessTrust, isStreamBased, sha256Hex } from "@/utils/trust"
import { indiaDate, normalizeExifDateTime } from "@/utils/dates"
import type {
  ExifSummary,
  FieldObservation,
  GeoLocation,
  WGS84Position,
} from "@/types/domain"
import type { FeatureCollection, LineStringGeometry } from "@/types/geojson"

const formSchema = z.object({
  assetType: z.enum([
    "Check dam",
    "Farm pond",
    "Plantation",
    "Percolation tank",
  ]),
  watershedId: z.string().min(1, "Select a watershed."),
  village: z.string().trim().min(2, "Enter a village name."),
  description: z
    .string()
    .trim()
    .min(8, "Add at least 8 characters of inspection notes."),
  inspectionDate: z.string().min(1, "Select the inspection date."),
})

type FormValues = z.infer<typeof formSchema>

export function ImageUploadPage() {
  const context = useContext(AppContext)
  const data = useHydroSnap()
  const { watersheds, saveObservation } = data
  const currentUser = data.currentUser.data
  const fileInput = useRef<HTMLInputElement>(null)
  const fileSelectionId = useRef(0)
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState("")
  const [exifLocation, setExifLocation] = useState<GeoLocation>()
  const [candidateLocation, setCandidateLocation] = useState<GeoLocation>()
  const [confirmedLocation, setConfirmedLocation] = useState<GeoLocation>()
  const [coordinateText, setCoordinateText] = useState("")
  const [locationMessage, setLocationMessage] = useState("")
  const [locationError, setLocationError] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exifSummary, setExifSummary] = useState<ExifSummary>()
  const [imageHash, setImageHash] = useState<string>()
  const [watershedNote, setWatershedNote] = useState("")
  const assets = data.assets
  const streams = useMemo(() => {
    const layer = (data.layers.data ?? []).find(({ id }) => id === "streams")
    const geometry = layer?.geometry
    return geometry?.type === "FeatureCollection"
      ? geometry as FeatureCollection<LineStringGeometry>
      : undefined
  }, [data.layers.data])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assetType: "Check dam",
      watershedId: context?.watershedId ?? "",
      village: "",
      description: "",
      inspectionDate: indiaDate(),
    },
  })
  const watchedValues = form.watch()
  const chosenWatershed = (watersheds.data ?? []).find(
    (item) => item.id === watchedValues.watershedId,
  )
  // Point-in-polygon: which watershed contains the confirmed location?
  const containingWatershed = useMemo(
    () =>
      confirmedLocation
        ? findContainingWatershed(
            confirmedLocation.coordinates,
            watersheds.data ?? [],
          )
        : undefined,
    [confirmedLocation, watersheds.data],
  )
  // Stream snap preview (stream-based assets only; never moves the point).
  const streamSnap = useMemo(
    () =>
      confirmedLocation && isStreamBased(watchedValues.assetType)
        ? nearestStreamPoint(confirmedLocation.coordinates, streams)
        : undefined,
    [confirmedLocation, streams, watchedValues.assetType],
  )
  const trust = useMemo(() => {
    if (!confirmedLocation) return undefined
    return assessTrust({
      location: confirmedLocation,
      exifLocation,
      exif: exifSummary,
      inspectionDate: watchedValues.inspectionDate,
      assetType: watchedValues.assetType,
      imageSha256: imageHash,
      existing: data.observations.data ?? [],
      containingWatershed,
      declaredWatershedId: watchedValues.watershedId,
      snapDistanceMeters: streamSnap?.distanceMeters,
      manualShiftMeters:
        exifLocation && confirmedLocation.source !== "exif"
          ? distanceMeters(
              exifLocation.coordinates,
              confirmedLocation.coordinates,
            )
          : undefined,
    })
  }, [
    confirmedLocation,
    containingWatershed,
    data.observations.data,
    exifLocation,
    exifSummary,
    imageHash,
    streamSnap,
    watchedValues.assetType,
    watchedValues.inspectionDate,
    watchedValues.watershedId,
  ])

  // Auto-attach the observation to the containing watershed once confirmed.
  useEffect(() => {
    if (!confirmedLocation) {
      setWatershedNote("")
      return
    }
    if (containingWatershed) {
      form.setValue("watershedId", containingWatershed.id)
      setWatershedNote(
        `Inside ${containingWatershed.name} (${containingWatershed.code}). Watershed set automatically.`,
      )
    } else {
      setWatershedNote(
        "This point is outside every known watershed boundary. Choose a watershed manually; the record will be flagged for review.",
      )
    }
  }, [confirmedLocation, containingWatershed, form])

  useEffect(() => {
    if (!context?.watershedId) return
    form.setValue("watershedId", context.watershedId)
  }, [context?.watershedId, form])

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function clearImageSelection() {
    fileSelectionId.current++
    if (fileInput.current) fileInput.current.value = ""
    setFile(undefined)
    setPreview("")
    setExifLocation(undefined)
    setCandidateLocation(undefined)
    setConfirmedLocation(undefined)
    setCoordinateText("")
    setLocationMessage("")
    setLocationError("")
    setExtracting(false)
    setError("")
    setSaved(false)
    setExifSummary(undefined)
    setImageHash(undefined)
    setWatershedNote("")
    setShowLocationPicker(false)
  }

  async function selectFile(selected?: File) {
    if (!selected) return
    clearImageSelection()
    const selectionId = fileSelectionId.current
    if (!selected.type.startsWith("image/")) {
      setError("Choose a browser-previewable image file.")
      return
    }
    if (
      /\.hei[cf]$/i.test(selected.name) ||
      /image\/hei[cf]/i.test(selected.type)
    ) {
      setError(
        "HEIC images are not supported. Choose a JPG, PNG, or previewable image.",
      )
      return
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError("Choose an image smaller than 20 MB.")
      return
    }
    if (!(await canPreviewImage(selected))) {
      if (selectionId === fileSelectionId.current) {
        setError("This browser cannot preview the selected image format.")
      }
      return
    }
    if (selectionId !== fileSelectionId.current) return
    setFile(selected)
    setExtracting(true)
    void sha256Hex(selected)
      .then((hash) => {
        if (selectionId === fileSelectionId.current) setImageHash(hash)
      })
      .catch(() => undefined)
    try {
      const tags = (await exifr
        .parse(selected, {
          pick: ["DateTimeOriginal", "Make", "Model"],
          reviveValues: false,
        })
        .catch(() => undefined)) as {
        DateTimeOriginal?: string | Date
        Make?: string
        Model?: string
      } | undefined
      const gps = await exifr.gps(selected).catch(() => undefined)
      if (selectionId !== fileSelectionId.current) return
      setExifSummary({
        hasGps: Boolean(
          gps &&
            Number.isFinite(gps.latitude) &&
            Number.isFinite(gps.longitude),
        ),
        takenAt: normalizeExifDateTime(tags?.DateTimeOriginal),
        make: tags?.Make,
        model: tags?.Model,
      })
      if (
        gps &&
        Number.isFinite(gps.latitude) &&
        Number.isFinite(gps.longitude)
      ) {
        const location = toGeoLocation(gps.longitude, gps.latitude, "exif")
        setExifLocation(location)
        setCandidateLocation(location)
        setCoordinateText(
          `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`,
        )
        setLocationMessage(
          "GPS coordinates found in image metadata. Review and confirm before saving.",
        )
      } else {
        setLocationMessage(
          "No EXIF GPS coordinates found. Use device location or place a map pin.",
        )
      }
    } catch {
      if (selectionId === fileSelectionId.current) {
        setLocationMessage(
          "Image metadata could not be read. You can set the location manually.",
        )
      }
    } finally {
      if (selectionId === fileSelectionId.current) setExtracting(false)
    }
  }

  function setCoordinates(text: string) {
    setCoordinateText(text)
    setLocationError("")
    setConfirmedLocation(undefined)
    const parts = text.split(",").map((part) => Number(part.trim()))
    if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {
      setCandidateLocation(undefined)
      return
    }
    const exifText = exifLocation
      ? `${exifLocation.coordinates[1].toFixed(6)}, ${exifLocation.coordinates[0].toFixed(6)}`
      : ""
    if (exifLocation && text === exifText) {
      setCandidateLocation(exifLocation)
      return
    }
    try {
      setCandidateLocation(toGeoLocation(parts[1], parts[0], "manual"))
    } catch {
      setCandidateLocation(undefined)
    }
  }

  function confirmCandidate() {
    if (!candidateLocation) {
      setLocationError("Enter a valid latitude, longitude pair.")
      return
    }
    if (exifLocation && candidateLocation.source !== "exif") {
      setLocationMessage(
        "You changed the EXIF position. Confirm this corrected position to continue.",
      )
    } else {
      setLocationMessage(
        `Location confirmed from ${
          candidateLocation.source === "exif"
            ? "image EXIF"
            : candidateLocation.source === "device"
              ? "device GPS"
              : "manual map pin"
        }.`,
      )
    }
    setConfirmedLocation(candidateLocation)
    setLocationError("")
  }

  function getDeviceLocation() {
    setLocationError("")
    setLocationMessage("")
    if (!navigator.geolocation) {
      setLocationError("Device location is not supported by this browser.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = toGeoLocation(
          coords.longitude,
          coords.latitude,
          "device",
          coords.accuracy,
        )
        setCandidateLocation(location)
        setConfirmedLocation(undefined)
        setCoordinateText(
          `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
        )
        setLocationMessage(
          "Device GPS acquired. Review and confirm; it will not replace image coordinates without your approval.",
        )
      },
      (positionError) => {
        const messages: Record<number, string> = {
          1: "Location permission was denied. Allow access or place a map pin.",
          2: "Device location is unavailable. Try again or place a map pin.",
          3: "Device location request timed out. Try again or place a map pin.",
        }
        setLocationError(
          messages[positionError.code] ?? "Could not access device location.",
        )
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }

  function setManualPin(position: WGS84Position) {
    const location = toGeoLocation(position[0], position[1], "manual")
    setCandidateLocation(location)
    setConfirmedLocation(undefined)
    setCoordinateText(`${position[1].toFixed(6)}, ${position[0].toFixed(6)}`)
    setLocationMessage(
      "Manual map pin set. Confirm this location before saving.",
    )
    setLocationError("")
    setShowLocationPicker(false)
  }

  async function submit(values: FormValues) {
    setError("")
    setSaved(false)
    if (!file) {
      setError("Add a field image before saving the observation.")
      return
    }
    if (!currentUser) {
      setError("Officer profile is unavailable. Try reloading before saving.")
      return
    }
    if (!confirmedLocation) {
      setLocationError("Confirm the photo location before saving.")
      return
    }
    if (extracting) {
      setError("Wait for image metadata extraction to finish.")
      return
    }
    setSaving(true)
    try {
      const imageDataUrl = await readFileAsDataUrl(file)
      const id = makeId()
      const now = new Date().toISOString()
      const auditHistory: FieldObservation["auditHistory"] = [
        {
          action: `Location confirmed (${sourceLabel(confirmedLocation)})`,
          actor: currentUser.name,
          timestamp: now,
        },
      ]
      if (containingWatershed?.id !== values.watershedId) {
        auditHistory.push({
          action: containingWatershed
            ? `Watershed manually set to ${values.watershedId} (point lies in ${containingWatershed.id})`
            : `Watershed manually set to ${values.watershedId} (point outside known boundaries)`,
          actor: currentUser.name,
          timestamp: now,
        })
      }
      auditHistory.push({
        action: `Client trust check: ${trust?.status ?? "not run"}`,
        actor: "HydroSnap rules (client preview)",
        timestamp: now,
      })
      auditHistory.push({
        action: "Submitted for verification",
        actor: currentUser.name,
        timestamp: now,
      })
      const observation: FieldObservation = {
        id,
        idempotencyKey: id,
        imageSha256: imageHash,
        exif: exifSummary,
        watershedResolution: containingWatershed
          ? containingWatershed.id === values.watershedId
            ? "inside"
            : "manual"
          : "outside",
        snappedLocation: streamSnap
          ? {
              type: "Point",
              coordinates: streamSnap.position,
              source: "snapped",
            }
          : undefined,
        snapDistanceMeters: streamSnap?.distanceMeters,
        trust,
        watershedId: values.watershedId,
        assetType: values.assetType,
        imageName: file.name,
        imageDataUrl,
        location: confirmedLocation,
        village: values.village,
        description: values.description,
        inspectionDate: values.inspectionDate,
        officerId: currentUser.id,
        officerName: currentUser.name,
        verificationStatus:
          trust?.status === "Flagged" ? "Flagged" : "Pending review",
        createdAt: now,
        auditHistory,
      }
      await saveObservation.mutateAsync(observation)
      setSaved(true)
      context?.notify(
        navigator.onLine
          ? "Field observation saved and queued for sync. It is visible on the map."
          : "Saved on this device. It will sync automatically when you are back online.",
      )
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save field observation.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack upload-page">
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-mark" /> FIELD OPERATIONS
          </div>
          <h1>Geo-coded images</h1>
          <p>
            Capture field evidence, confirm its location and submit it for
            officer review.
          </p>
        </div>
        <Link to="/evidence" className="button button-secondary">
          <ArrowLeft size={15} /> Evidence registry
        </Link>
      </div>
      {saved ? (
        <section className="panel upload-success">
          <span className="success-large">
            <Check size={27} />
          </span>
          <div className="eyebrow">
            <span className="eyebrow-mark" /> SUBMISSION RECEIVED
          </div>
          <h2>Field observation saved</h2>
          <p>
            Your image and confirmed location have been saved as field evidence
            and added to the watershed map, pending verification.
          </p>
          <div className="success-summary">
            <img src={preview} alt="Submitted field evidence" />
            <div>
              <strong>{file?.name}</strong>
              <span>
                {form.getValues("assetType")} · {form.getValues("village")}
              </span>
              <small>
                {confirmedLocation?.coordinates[1].toFixed(6)}° N,{" "}
                {confirmedLocation?.coordinates[0].toFixed(6)}° E
              </small>
            </div>
            <span className="status-pill status-amber">Pending review</span>
          </div>
          <div className="success-actions">
            <Link to="/map" className="button button-primary">
              View on map <ArrowRight size={16} />
            </Link>
            <button
              className="button button-secondary"
              onClick={() => {
                clearImageSelection()
                form.reset()
              }}
            >
              Add another observation
            </button>
          </div>
        </section>
      ) : (
        <form className="upload-layout" onSubmit={form.handleSubmit(submit)}>
          <div className="upload-main-column">
            <section className="panel form-panel">
              <div className="form-panel-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>Field image</h2>
                  <p>
                    Upload an image from the field. GPS metadata is read when
                    available.
                  </p>
                </div>
                <span className="optional-label">REQUIRED</span>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/bmp"
                capture="environment"
                className="visually-hidden"
                onChange={(event) => void selectFile(event.target.files?.[0])}
              />
              {file ? (
                <div className="image-preview-card">
                  <img src={preview} alt="Field image preview" />
                  <div className="image-preview-shade" />
                  <div className="image-preview-info">
                    <span className="file-icon">
                      <FileImage size={18} />
                    </span>
                    <span>
                      <strong>{file.name}</strong>
                      <small>
                        {(file.size / 1024 / 1024).toFixed(2)} MB{" "}
                        {extracting && "· Reading GPS metadata…"}
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={clearImageSelection}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <button
                    className="replace-image"
                    type="button"
                    onClick={() => fileInput.current?.click()}
                  >
                    <RotateCcw size={14} /> Replace image
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="upload-dropzone"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    void selectFile(event.dataTransfer.files[0])
                  }}
                >
                  <span className="upload-drop-icon">
                    <Upload size={21} />
                  </span>
                  <strong>Drop your field image here</strong>
                  <span>
                    or <u>browse files</u> to upload
                  </span>
                  <small>
                    JPG, PNG, or browser-previewable image · Max 20 MB
                  </small>
                </button>
              )}
              {error && (
                <div className="form-error-banner">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
            </section>

            <section className="panel form-panel location-panel">
              <div className="form-panel-heading">
                <span className="step-number">02</span>
                <div>
                  <h2>Location confirmation</h2>
                  <p>
                    Review the photo coordinates and explicitly confirm the
                    position to use. Gallery photos may have no GPS metadata;
                    use device GPS if coordinates are missing.
                  </p>
                </div>
                <span className="optional-label">REQUIRED</span>
              </div>
              <div className="location-status-card">
                <span
                  className={`location-status-icon ${
                    confirmedLocation ? "confirmed" : ""
                  }`}
                >
                  {confirmedLocation ? (
                    <CheckCircle2 size={19} />
                  ) : (
                    <MapPin size={19} />
                  )}
                </span>
                <div className="location-status-copy">
                  <strong>
                    {confirmedLocation
                      ? "Location confirmed"
                      : candidateLocation
                        ? "Location found — confirmation needed"
                        : "No confirmed location yet"}
                  </strong>
                  <span>
                    {locationMessage ||
                      "Coordinates from EXIF, device GPS or a manual pin will be shown here."}
                  </span>
                </div>
                {confirmedLocation && (
                  <span className="confirmed-badge">
                    <ShieldCheck size={14} /> CONFIRMED
                  </span>
                )}
              </div>
              <div className="coordinate-controls">
                <label className="form-field">
                  <span>
                    Latitude, longitude <small>(WGS84)</small>
                  </span>
                  <div className="coordinate-input-wrap">
                    <MapPin size={15} />
                    <input
                      value={coordinateText}
                      onChange={(event) => setCoordinates(event.target.value)}
                      placeholder="18.226000, 74.478000"
                      aria-label="Latitude, longitude coordinates"
                    />
                  </div>
                  {candidateLocation && (
                    <small className="coordinate-source">
                      Source: {sourceLabel(candidateLocation)}
                      {candidateLocation.accuracyMeters
                        ? ` · ±${Math.round(candidateLocation.accuracyMeters)} m`
                        : ""}
                    </small>
                  )}
                </label>
                <div className="coordinate-buttons">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={getDeviceLocation}
                  >
                    <Navigation size={15} /> Use device GPS
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setShowLocationPicker((value) => !value)}
                  >
                    <Crosshair size={15} /> Place map pin
                  </button>
                </div>
              </div>
              {showLocationPicker && (
                <div className="location-picker">
                  <div>
                    <strong>Click the map to place a pin</strong>
                    <button
                      type="button"
                      aria-label="Close map picker"
                      onClick={() => setShowLocationPicker(false)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="location-picker-map">
                    <WatershedMap
                      assets={assets.data ?? []}
                      watershed={chosenWatershed}
                      watersheds={watersheds.data}
                      basemap="standard"
                      visibleLayers={{
                        boundary: true,
                        streams: true,
                        assets: false,
                        ndvi: false,
                        ndwi: false,
                      }}
                      measure={false}
                      onSelectAsset={() => undefined}
                      onMapClick={setManualPin}
                    />
                  </div>
                </div>
              )}
              {candidateLocation && !confirmedLocation && (
                <div className="coordinate-confirm-row">
                  <span>
                    <strong>Detected:</strong>{" "}
                    {candidateLocation.coordinates[1].toFixed(6)}° N,{" "}
                    {candidateLocation.coordinates[0].toFixed(6)}° E
                    {exifLocation && candidateLocation.source === "manual" && (
                      <em> · manually corrected from EXIF</em>
                    )}
                  </span>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={confirmCandidate}
                  >
                    Confirm this location <Check size={14} />
                  </button>
                </div>
              )}
              {locationError && (
                <div className="field-error">
                  <AlertCircle size={14} />
                  {locationError}
                </div>
              )}
              {exifLocation && (
                <div className="exif-note">
                  <ShieldCheck size={15} />
                  <span>
                    Original EXIF position:{" "}
                    {exifLocation.coordinates[1].toFixed(6)}° N,{" "}
                    {exifLocation.coordinates[0].toFixed(6)}° E. Coordinates are
                    not changed unless you edit and confirm them.
                  </span>
                </div>
              )}
            </section>

            <section className="panel form-panel">
              <div className="form-panel-heading">
                <span className="step-number">03</span>
                <div>
                  <h2>Observation details</h2>
                  <p>
                    Describe the asset and the field visit for the review
                    record.
                  </p>
                </div>
                <span className="optional-label">REQUIRED</span>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  <span>Asset type</span>
                  <select {...form.register("assetType")}>
                    <option>Check dam</option>
                    <option>Farm pond</option>
                    <option>Plantation</option>
                    <option>Percolation tank</option>
                  </select>
                  {form.formState.errors.assetType && (
                    <small className="field-error">
                      {form.formState.errors.assetType.message}
                    </small>
                  )}
                </label>
                <label className="form-field">
                  <span>Inspection date</span>
                  <input type="date" {...form.register("inspectionDate")} />
                  {form.formState.errors.inspectionDate && (
                    <small className="field-error">
                      {form.formState.errors.inspectionDate.message}
                    </small>
                  )}
                </label>
                <label className="form-field">
                  <span>Watershed</span>
                  <select {...form.register("watershedId")}>
                    {(watersheds.data ?? []).map((watershed) => (
                      <option key={watershed.id} value={watershed.id}>
                        {watershed.name} · {watershed.code}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.watershedId && (
                    <small className="field-error">
                      {form.formState.errors.watershedId.message}
                    </small>
                  )}
                  {watershedNote && (
                    <small
                      className={
                        containingWatershed ? "hs-note-ok" : "hs-note-warn"
                      }
                    >
                      {watershedNote}
                    </small>
                  )}
                </label>
                <label className="form-field">
                  <span>Village</span>
                  <input
                    placeholder="Enter village name"
                    {...form.register("village")}
                  />
                  {form.formState.errors.village && (
                    <small className="field-error">
                      {form.formState.errors.village.message}
                    </small>
                  )}
                </label>
                <label className="form-field field-full">
                  <span>Field notes</span>
                  <textarea
                    placeholder="Describe the asset condition, observations or follow-up needed..."
                    rows={4}
                    {...form.register("description")}
                  />
                  {form.formState.errors.description && (
                    <small className="field-error">
                      {form.formState.errors.description.message}
                    </small>
                  )}
                </label>
              </div>
              <div className="officer-info">
                <div className="avatar">{currentUser?.initials ?? "--"}</div>
                <span>
                  <strong>Submitting officer</strong>
                  <small>
                    {currentUser?.name ?? "Loading profile"}
                    {currentUser?.role ? ` · ${currentUser.role}` : ""}
                  </small>
                </span>
                <span className="officer-verified">
                  <CheckCircle2 size={14} /> Officer profile loaded
                </span>
              </div>
            </section>
            <div className="upload-form-actions">
              <Link to="/" className="button button-secondary">
                Cancel
              </Link>
              <button
                className="button button-primary"
                type="submit"
                disabled={saving || extracting || !currentUser}
              >
                {saving ? (
                  <>
                    <LoaderCircle className="spin" size={16} /> Saving evidence…
                  </>
                ) : (
                  <>
                    Save field evidence <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
          <aside className="upload-side-column">
            <section className="panel workflow-panel">
              <div className="section-kicker">
                <span className="kicker-dot green-dot" /> FIELD WORKFLOW
              </div>
              <h3>From field to map</h3>
              <div className="workflow-steps">
                <div className={`workflow-step ${file ? "done" : "current"}`}>
                  <span>{file ? <Check size={13} /> : "1"}</span>
                  <div>
                    <strong>Upload image</strong>
                    <small>Choose a field photo</small>
                  </div>
                </div>
                <i />
                <div
                  className={`workflow-step ${
                    confirmedLocation ? "done" : file ? "current" : ""
                  }`}
                >
                  <span>{confirmedLocation ? <Check size={13} /> : "2"}</span>
                  <div>
                    <strong>Confirm location</strong>
                    <small>Review EXIF or pin location</small>
                  </div>
                </div>
                <i />
                <div className="workflow-step">
                  <span>3</span>
                  <div>
                    <strong>Officer review</strong>
                    <small>Verify before publishing</small>
                  </div>
                </div>
                <i />
                <div className="workflow-step">
                  <span>4</span>
                  <div>
                    <strong>View on map</strong>
                    <small>Asset appears immediately</small>
                  </div>
                </div>
              </div>
              <div className="workflow-note">
                <ShieldCheck size={15} />
                <span>
                  GPS is never silently modified. You review and confirm every
                  location.
                </span>
              </div>
            </section>
            <TrustPanel
              trust={trust}
              imageHash={imageHash}
              snapDistanceMeters={streamSnap?.distanceMeters}
              streamName={streamSnap?.streamName}
            />
            <section className="panel upload-hint-panel">
              <div className="upload-hint-icon">
                <FileImage size={17} />
              </div>
              <strong>Image classification</strong>
              <p>
                No content model is enabled. Select and confirm the asset type
                yourself; a future model will only suggest, never reject.
              </p>
              <span className="future-badge">PLANNED · SUGGESTION ONLY</span>
            </section>
            <section className="panel upload-hint-panel offline-hint">
              <div className="upload-hint-icon">
                <Navigation size={17} />
              </div>
              <strong>Field-ready capture</strong>
              <p>
                The upload form works offline after the site has loaded online
                once. Evidence is saved to this device first, then synced when
                online; the map and map tiles do not work offline.
              </p>
              <span className="future-badge">OFFLINE QUEUE + AUTO-SYNC</span>
            </section>
          </aside>
        </form>
      )}
    </div>
  )
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `obs-${crypto.randomUUID()}`
    : `obs-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function sourceLabel(location: GeoLocation): string {
  return location.source === "exif"
    ? "Image EXIF"
    : location.source === "device"
      ? "Device GPS"
      : location.source === "snapped"
        ? "Derived stream snap"
        : "Manual pin"
}

function canPreviewImage(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file)
  return new Promise<boolean>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth > 0)
    image.onerror = () => resolve(false)
    image.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read field image."))
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not encode field image."))
    reader.readAsDataURL(file)
  })
}
