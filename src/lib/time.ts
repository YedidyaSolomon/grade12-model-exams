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

export function formatEAT(value: string | Date): string {
  return `${dateTimeFmt.format(new Date(value))} EAT`
}

export function formatTimeEAT(value: string | Date): string {
  return timeFmt.format(new Date(value))
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
