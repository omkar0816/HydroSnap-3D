const INDIA_TIME_ZONE = "Asia/Kolkata"

export function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const value = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  )
  return `${value.year}-${value.month}-${value.day}`
}

export function indiaDate(date = new Date()): string {
  return dateInTimeZone(date, INDIA_TIME_ZONE)
}

/** Converts an EXIF date string without assigning it an unknown timezone. */
export function normalizeExifDateTime(value: unknown): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    const pad = (part: number) => String(part).padStart(2, "0")
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  if (typeof value !== "string") return undefined

  const exifDate = value.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  )
  if (exifDate) {
    return `${exifDate[1]}-${exifDate[2]}-${exifDate[3]}T${exifDate[4]}:${exifDate[5]}:${exifDate[6]}`
  }

  const isoDateTime = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  return isoDateTime ? value : undefined
}

/** Absolute difference in calendar days, independent of browser timezone. */
export function calendarDateDistanceDays(
  first: string,
  second: string,
): number | undefined {
  const firstDay = dateOrdinal(first)
  const secondDay = dateOrdinal(second)
  if (firstDay === undefined || secondDay === undefined) return undefined
  return Math.abs(firstDay - secondDay)
}

function dateOrdinal(value: string): number | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return undefined
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return timestamp / 86_400_000
}
