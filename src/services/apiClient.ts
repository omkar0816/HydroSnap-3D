import { env } from "@/config/env"

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new ApiError(
      detail || `Request failed with status ${response.status}`,
      response.status,
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
