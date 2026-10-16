const maxDimension = 1024
const jpegQuality = 0.82

export async function downscalePhoto(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image)
  try {
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    )
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not prepare the photo for AI review.")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const compressed = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", jpegQuality),
    )
    if (!compressed) throw new Error("Could not compress the photo.")
    return compressed
  } finally {
    bitmap.close()
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not encode the photo for AI review."))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not encode the photo."))
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(",") + 1)
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error("Could not read the queued field photo.")
  return response.blob()
}
