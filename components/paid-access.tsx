"use client"

import { useAuth } from "@clerk/nextjs"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
import { LockKeyholeIcon, ArrowUpRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import {
  isBillingFailure,
  paidPlanMessage,
  paidPlanSlug,
  type BillingFailure,
} from "@/lib/billing-policy"

const PaidAccessContext = createContext(false)
const upgradeEvent = "teammates:upgrade-required"

export function PaidAccessProvider({
  allowed,
  children,
}: {
  allowed: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = (event: Event) => {
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener(upgradeEvent, show)
    return () => window.removeEventListener(upgradeEvent, show)
  }, [])
  return (
    <PaidAccessContext value={allowed}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-7 text-center sm:max-w-md">
          <LockKeyholeIcon className="mx-auto size-8 text-muted-foreground" />
          <DialogHeader className="items-center text-center">
            <DialogTitle>Unlock your workspace with Pro</DialogTitle>
            <DialogDescription>
              Bots, group chats, memory, and cloud computers require an active
              paid plan. Pro includes all features for $20/month.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <DialogClose render={<Button variant="outline">Not now</Button>} />
            <Button
              nativeButton={false}
              render={<Link href="/pricing" onClick={() => setOpen(false)} />}
            >
              View pricing
              <ArrowUpRightIcon data-icon="inline-end" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaidAccessContext>
  )
}

export function UpgradeRequired() {
  return (
    <section
      aria-label="Subscription required"
      className="flex min-h-full flex-1 items-center justify-center px-6 py-12"
    >
      <div className="max-w-md text-center">
        <LockKeyholeIcon className="mx-auto mb-6 size-10 text-muted-foreground" />
        <h1 className="text-3xl font-semibold tracking-tight">
          Your team starts with Pro
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          You’re on the Free plan. Subscribe to create bots and group chats,
          send messages, and use bot computers. All features are included for
          $20/month.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/pricing" />}
          >
            View pricing & upgrade
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/billing" />}
          >
            Billing & account
          </Button>
        </div>
      </div>
    </section>
  )
}

export function showUpgradeToast() {
  if (
    typeof window !== "undefined" &&
    !window.dispatchEvent(new Event(upgradeEvent, { cancelable: true }))
  )
    return
  toast.add({
    title: "Pro plan required",
    description: (
      <>
        {paidPlanMessage}{" "}
        <Link
          href="/pricing"
          className="font-medium text-foreground underline underline-offset-4"
        >
          View plans
        </Link>
      </>
    ),
    type: "error",
    timeout: 8000,
  })
}

export function handleBillingFailure(value: unknown): value is BillingFailure {
  if (!isBillingFailure(value)) return false
  showUpgradeToast()
  return true
}

export function notifyBillingError(error: Error) {
  if (error.message.includes(paidPlanMessage)) showUpgradeToast()
}

export function usePaidAccess() {
  const verified = useContext(PaidAccessContext)
  const { isLoaded, has } = useAuth()
  return useCallback(() => {
    if (verified && !isLoaded) return false
    if (verified && has?.({ plan: paidPlanSlug })) return true
    showUpgradeToast()
    return false
  }, [isLoaded, has, verified])
}

export function useVerifiedPaidAccess() {
  const verified = useContext(PaidAccessContext)
  const { isLoaded, has } = useAuth()
  return verified && isLoaded && !!has?.({ plan: paidPlanSlug })
}
