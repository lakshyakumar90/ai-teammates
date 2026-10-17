"use client"

import { useAuth } from "@clerk/nextjs"
import { useCallback } from "react"
import { recoverSessionAction } from "@/lib/auth-policy"

export function useSessionAction() {
  const { getToken } = useAuth()
  return useCallback(
    <T>(action: () => Promise<T>) =>
      recoverSessionAction(action, () => getToken({ skipCache: true })),
    [getToken]
  )
}
