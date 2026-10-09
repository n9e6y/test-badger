export const formatCost = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`)

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export const TEST_TYPE_LABEL: Record<string, string> = {
  registration: 'Registration test',
  store: 'Store & checkout test',
}
