import { z } from "zod"

export const apiKeySchema = z.object({
  provider: z.enum(["gemini", "openrouter"]),
  key: z
    .string()
    .trim()
    .min(1, "Enter an API key")
    .max(512)
    .regex(/^\S+$/, "API keys cannot contain spaces"),
})
export type ApiKeyProvider = z.infer<typeof apiKeySchema>["provider"]
