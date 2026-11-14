import { useEffect, useState } from 'react'

/** Current time, refreshed every `everyMs` while `active` (for elapsed-time labels). */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [active, everyMs])
  return now
}
