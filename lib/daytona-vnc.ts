import { managedSandbox } from "./sandbox-usage"

export async function getSandboxVncUrl(sandboxId: string, userId: string) {
  const sandbox = await managedSandbox(userId, sandboxId)
  await sandbox.computerUse.start()

  // A signed URL grants temporary access to this port only, never the API key.
  const preview = await sandbox.getSignedPreviewUrl(6080, 900)
  const url = new URL(preview.url)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/websockify"
  return url.toString()
}
