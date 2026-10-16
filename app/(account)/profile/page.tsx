import type { Metadata } from "next"
import { UserProfile } from "@clerk/nextjs"

export const metadata: Metadata = { title: "Profile — AI Teammates" }

export default function ProfilePage() {
  return (
    <section className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-12">
      <header className="mx-auto mb-8 max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account details and security.
        </p>
      </header>
      <div className="flex min-w-0 justify-center">
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full max-w-4xl",
              cardBox: "w-full max-w-full",
            },
          }}
        />
      </div>
    </section>
  )
}
