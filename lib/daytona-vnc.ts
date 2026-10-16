import { createDaytonaClient } from "./daytona-client"

export async function getSandboxVncUrl(sandboxId: string) {
  const sandbox = await createDaytonaClient().get(sandboxId)
  if (sandbox.state !== "started") await sandbox.start()
  await sandbox.computerUse.start()

  // A signed URL grants temporary access to this port only, never the API key.
  const preview = await sandbox.getSignedPreviewUrl(6080, 3600)
  const url = new URL(preview.url)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/websockify"
  return url.toString()
}
