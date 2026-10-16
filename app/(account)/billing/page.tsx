import type { Metadata } from "next"
import Link from "next/link"
import { UserProfile } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Billing & account — AI Teammates" }

export default async function BillingPage() {
  await auth.protect()
  return (
    <section className="min-w-0 flex-1 bg-background px-4 py-8 text-foreground sm:px-8">
      <header className="mx-auto mb-8 flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Billing & account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your plan, payment methods, and account with Clerk.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/dashboard" />}
          >
            Dashboard
          </Button>
          <Button nativeButton={false} render={<Link href="/pricing" />}>
            View pricing
          </Button>
        </div>
      </header>
      <div className="flex justify-center">
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full max-w-5xl",
              cardBox: "w-full max-w-full",
            },
          }}
        />
      </div>
    </section>
  )
}
