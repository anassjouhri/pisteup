import { formatDistanceToNow, format } from 'date-fns'

function safeDate(val: string | Date | null | undefined): Date | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

export function formatRelative(val: string | Date | null | undefined): string {
  const d = safeDate(val)
  if (!d) return 'recently'
  try { return formatDistanceToNow(d, { addSuffix: true }) } catch { return 'recently' }
}

export function formatDate(val: string | Date | null | undefined): string {
  const d = safeDate(val)
  if (!d) return '—'
  try { return format(d, 'MMM d, yyyy') } catch { return '—' }
}

export function formatKm(km: number): string {
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${Math.round(km)} km`
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
