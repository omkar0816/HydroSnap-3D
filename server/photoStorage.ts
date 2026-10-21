import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { serverEnv } from "./env.ts"
import { HttpError } from "./validation.ts"

const uploadRoot = path.resolve(serverEnv.uploadDirectory)
const remotePrefix = "supabase:"

function storageUrl(objectPath: string, authenticatedRead = false): string {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/")
  const accessPath = authenticatedRead
    ? "object/authenticated/field-photos"
    : "object/field-photos"
  return `${serverEnv.supabaseUrl}/storage/v1/${accessPath}/${encodedPath}`
}

async function localStorageAvailable(): Promise<boolean> {
  try {
    await mkdir(uploadRoot, { recursive: true })
    await access(uploadRoot, 2)
    return true
  } catch {
    return false
  }
}

export async function storePhoto(input: {
  officerId: string
  observationId: string
  extension: string
  bytes: Buffer
  authorization: string
}): Promise<string> {
  if (await localStorageAvailable()) {
    const fileName = `${randomUUID()}${input.extension}`
    await writeFile(path.join(uploadRoot, fileName), input.bytes, { flag: "wx" })
    return fileName
  }

  const objectPath = `${input.officerId}/${input.observationId}${input.extension}`
  const contentType = input.extension === ".jpg"
    ? "image/jpeg"
    : `image/${input.extension.slice(1)}`
  let response: Response
  try {
    response = await fetch(storageUrl(objectPath), {
      method: "POST",
      headers: {
        Authorization: input.authorization,
        apikey: serverEnv.supabaseAnonKey,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: new Blob([new Uint8Array(input.bytes)], { type: contentType }),
    })
  } catch {
    throw new HttpError("Photo storage is unavailable.", 503)
  }
  if (!response.ok) throw new HttpError("Photo storage upload failed.", 502)
  return `${remotePrefix}${objectPath}`
}

export async function readPhoto(
  imagePath: string,
  authorization: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  if (!imagePath.startsWith(remotePrefix)) {
    const resolved = path.resolve(uploadRoot, imagePath)
    if (!resolved.startsWith(`${uploadRoot}${path.sep}`)) {
      throw new HttpError("Photo path is invalid.", 500)
    }
    try {
      return { bytes: await readFile(resolved), contentType: "application/octet-stream" }
    } catch {
      throw new HttpError("Photo was not found.", 404)
    }
  }

  const objectPath = imagePath.slice(remotePrefix.length)
  try {
    const response = await fetch(storageUrl(objectPath, true), {
      headers: {
        Authorization: authorization,
        apikey: serverEnv.supabaseAnonKey,
      },
    })
    if (response.status === 404) throw new HttpError("Photo was not found.", 404)
    if (!response.ok) throw new HttpError("Photo storage read failed.", 502)
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError("Photo storage is unavailable.", 503)
  }
}

export async function removePhoto(
  imagePath: string,
  authorization: string,
): Promise<void> {
  if (!imagePath.startsWith(remotePrefix)) {
    const resolved = path.resolve(uploadRoot, imagePath)
    if (!resolved.startsWith(`${uploadRoot}${path.sep}`)) return
    await unlink(resolved).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    })
    return
  }

  const objectPath = imagePath.slice(remotePrefix.length)
  const response = await fetch(storageUrl(objectPath), {
    method: "DELETE",
    headers: {
      Authorization: authorization,
      apikey: serverEnv.supabaseAnonKey,
    },
  })
  if (!response.ok && response.status !== 404) {
    throw new HttpError("Photo cleanup failed.", 502)
  }
}
