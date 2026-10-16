import type { Metadata } from "next"
import Link from "next/link"
import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import { ArrowLeftIcon, ArrowUpRightIcon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export const metadata: Metadata = {
  title: "Pricing — AI Teammates",
  description:
    "Pro is $20 per month and includes all AI Teammates features: bots, group chats, memory, and cloud computers.",
}

export default async function PricingPage() {
  const { isAuthenticated } = await auth()
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-7">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          AI Teammates
        </Link>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={isAuthenticated ? "/dashboard" : "/sign-in"} />}
        >
          {isAuthenticated ? "Dashboard" : "Sign in"}
          <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      </header>
      <main className="mx-auto max-w-5xl px-6 pt-12 pb-20 sm:pt-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h1 className="text-4xl font-medium tracking-tight text-balance sm:text-5xl">
            One plan. Your whole team.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Pro is $20/month and unlocks all app features. Create bots, bring
            them into group chats, and work with their cloud computers.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
            {[
              "Up to 3 bots & group chats",
              "$5 AI allowance per period",
              "20 sandbox hours per period",
            ].map((feature) => (
              <span key={feature} className="inline-flex items-center gap-2">
                <CheckIcon className="size-4 text-muted-foreground" />
                {feature}
              </span>
            ))}
          </div>
        </div>
        <PricingTable
          for="user"
          newSubscriptionRedirectUrl="/dashboard"
          fallback={
            <div
              role="status"
              className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner />
              Loading plans…
            </div>
          }
        />
        <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
          Free accounts can sign in and view plans. Creating or using bots and
          sandboxes requires Pro. Manage your subscription through your account
          menu. Pro includes one running sandbox at a time and up to 1,000 model
          requests per billing period. Both the AI cost allowance and request
          limit apply. Sessions stop after 15 minutes; reconnect to continue.
          Usage resets with your subscription. No automatic overage charges.
        </p>
        <div className="mt-10 text-center">
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline"
          >
            <ArrowLeftIcon className="size-4" />
            {isAuthenticated ? "Back to dashboard" : "Back to home"}
          </Link>
        </div>
      </main>
    </div>
  )
}
