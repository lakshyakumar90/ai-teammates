"use client"

import { useEffect, useState } from "react"
import { resetCountdown } from "@/lib/usage-policy"

export function UsageCountdown({
  endsAt,
  initialNow,
}: {
  endsAt: number
  initialNow: number
}) {
  const [now, setNow] = useState(initialNow)
  useEffect(() => {
    const started = performance.now()
    const timer = setInterval(
      () => setNow(initialNow + performance.now() - started),
      30000
    )
    return () => clearInterval(timer)
  }, [initialNow])
  return <span className="tabular-nums">{resetCountdown(endsAt, now)}</span>
}
