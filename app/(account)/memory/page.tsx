import type { Metadata } from "next"
import { getMemoryPreferences } from "@/actions/memory"
import { MemorySettingsForm } from "@/components/memory-settings-dialog"

export const metadata: Metadata = { title: "Memory & privacy — AI Teammates" }

export default async function MemoryPage() {
  const preferences = await getMemoryPreferences()
  return (
    <section className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Memory & privacy
          </h1>
          <p className="mt-2 text-muted-foreground">
            Control what your bots remember and share. Settings apply to future
            responses; they do not remove past messages or saved notes.
          </p>
        </header>
        <MemorySettingsForm initialPreferences={preferences} />
      </div>
    </section>
  )
}
