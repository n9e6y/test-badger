import { useEffect, useState } from 'react'

/** Seconds since `start` (ISO), ticking every second until `end` is set. */
export function useElapsed(start: string | null, end: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!start || end) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [start, end])
  if (!start) return 0
  const stop = end ? new Date(end).getTime() : now
  return Math.max(0, (stop - new Date(start).getTime()) / 1000)
}
