import { UserButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

export default async function Page() {
  await auth.protect()

  return (
    <main className="flex min-h-svh flex-col p-6">
      <header className="flex items-center justify-between">
        <span className="font-medium">AI Teammates</span>
        <UserButton />
      </header>
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3">
        <p className="text-sm text-muted-foreground">Workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">Project ready</h1>
        <p className="text-muted-foreground">
          You&apos;re signed in. Your AI teammate workspace is ready to build.
        </p>
      </section>
    </main>
  )
}
