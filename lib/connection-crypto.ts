import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function encryptionKey() {
  const key = Buffer.from(process.env.CONNECTION_ENCRYPTION_KEY ?? "", "base64")
  if (key.length !== 32)
    throw new Error(
      "CONNECTION_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
    )
  return key
}

export function encryptConnection(value: unknown, owner: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  cipher.setAAD(Buffer.from(owner))
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  return [iv, cipher.getAuthTag(), data]
    .map((part) => part.toString("base64url"))
    .join(".")
}

export function decryptConnection<T>(value: string, owner: string): T {
  const [iv, tag, data] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"))
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv)
  decipher.setAAD(Buffer.from(owner))
  decipher.setAuthTag(tag)
  return JSON.parse(
    Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  ) as T
}
