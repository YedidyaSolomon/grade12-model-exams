// All timestamps are stored in UTC. Display is always East Africa Time (UTC+3).
export const EAT_TIME_ZONE = 'Africa/Addis_Ababa'

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: EAT_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: EAT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: EAT_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' })

/** Hour of day (0–23) in EAT. Pass SERVER time (useServerClock), never Date.now(). */
export function eatHour(ms: number): number {
  return Number(hourFmt.format(new Date(ms)))
}

export function formatEAT(value: string | Date): string {
  return `${dateTimeFmt.format(new Date(value))} EAT`
}

export function formatTimeEAT(value: string | Date): string {
  return timeFmt.format(new Date(value))
}

/**
 * <input type="datetime-local"> values are always interpreted as EAT, whatever the admin's
 * device timezone is. Ethiopia has no DST, so a fixed +03:00 offset is exact.
 */
export function eatInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const d = new Date(`${value}:00+03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function isoToEatInput(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 16)
}

/** "3d 4h" when a day or more away, otherwise "1:05:09" / "05:09". */
export function formatCountdown(ms: number): string {
  const day = 24 * 60 * 60 * 1000
  if (ms >= day) {
    const d = Math.floor(ms / day)
    const h = Math.floor((ms % day) / 3_600_000)
    return `${d}d ${h}h`
  }
  return formatDuration(ms)
}

/** "1:05:09" / "05:09" from milliseconds (never negative). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Clock difference for people: "11 h 0 min" / "3 min" (rounded to the minute). */
export function formatSkew(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}
