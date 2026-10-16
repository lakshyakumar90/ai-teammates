import { wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { getModel } from "./models"
import { currentUsagePeriod, reserveUsage, settleAI } from "../usage"
import { tokenCost, UsageLimitError, usageLimits } from "../usage-policy"

// Published standard rates, USD / million tokens. No cache discounts are
// assumed. Unknown models fail closed rather than silently becoming free.
// Sources and review date are recorded in PRODUCT.md.
const rates: Record<string, { input: number; output: number }> = {
  "gemini-3-flash": { input: 0.5, output: 3 },
  "groq-gpt-oss-120b": { input: 0.15, output: 0.6 },
  "groq-gpt-oss-20b": { input: 0.075, output: 0.3 },
  "groq-qwen3.8-27b": { input: 0.8, output: 4 },
  "ollama-local": { input: 0, output: 0 },
}

async function modelRate(modelId: string) {
  if (rates[modelId]) return rates[modelId]
  const model = getModel(modelId)
  if (!modelId.startsWith("openrouter-"))
    throw new Error("Missing model pricing")
  // OpenRouter is authoritative for routing prices, including :free models.
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok)
    throw new UsageLimitError("Model pricing is temporarily unavailable.")
  const catalog = (await response.json()) as {
    data: { id: string; pricing: { prompt: string; completion: string } }[]
  }
  const entry = catalog.data.find((entry) => entry.id === model.modelId)
  if (!entry) throw new UsageLimitError("This model has no verified price.")
  const rate = {
    input: Number(entry.pricing.prompt) * 1e6,
    output: Number(entry.pricing.completion) * 1e6,
  }
  tokenCost(1, 1, rate)
  return rate
}

export async function meteredModel(
  modelId: string,
  userId: string,
  periodId: string
) {
  const rate = await modelRate(modelId)
  const reserve = async () => {
    // Recheck the subscription on every provider request, including handoffs,
    // memory extraction, tool steps, and SDK retries.
    const current = await currentUsagePeriod(userId)
    if (current.id !== periodId)
      throw new UsageLimitError(
        "Your subscription period changed. Send the message again."
      )
    return reserveUsage(
      periodId,
      "ai",
      tokenCost(usageLimits.maxInputTokens, usageLimits.maxOutputTokens, rate),
      modelId
    )
  }
  return wrapLanguageModel({
    model: getModel(modelId),
    middleware: createUsageMiddleware({ reserve, rate, settle: settleAI }),
  })
}

export function createUsageMiddleware({
  reserve,
  rate,
  settle,
}: {
  reserve: () => Promise<string>
  rate: { input: number; output: number }
  settle: typeof settleAI
}): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => {
      // Bound text/tool payloads before sending them. Binary inputs are given a
      // separate conservative ceiling; audio/video and arbitrary files are not
      // supported by the metered chat path.
      let imageBudget = 0
      let bytes =
        Buffer.byteLength(
          JSON.stringify(params.prompt, function (key, value) {
            // Files can be binary arrays or base64 strings. Count images by a
            // token ceiling instead of counting their encoded transport bytes.
            if (
              key === "data" &&
              typeof this.mediaType === "string" &&
              this.mediaType.startsWith("image/")
            ) {
              imageBudget += 32768
              return "[image]"
            }
            return value
          })
        ) + Buffer.byteLength(JSON.stringify(params.tools ?? []))
      for (const message of params.prompt) {
        if (typeof message.content === "string") continue
        for (const part of message.content) {
          if (part.type === "file") {
            if (!part.mediaType.startsWith("image/"))
              throw new UsageLimitError("Only image attachments are supported.")
          }
        }
      }
      bytes += imageBudget
      if (bytes > 100000)
        throw new UsageLimitError(
          "This conversation is too large. Start a shorter chat or remove attachments."
        )
      return {
        ...params,
        maxOutputTokens: Math.min(
          params.maxOutputTokens ?? usageLimits.maxOutputTokens,
          usageLimits.maxOutputTokens
        ),
      }
    },
    wrapGenerate: async ({ doGenerate }) => {
      const id = await reserve()
      // On an ambiguous failure keep the reservation: the provider may already
      // have billed it. This prevents abort/retry abuse and fails closed.
      const result = await doGenerate()
      const input = result.usage.inputTokens.total
      const output = result.usage.outputTokens.total
      if (input !== undefined && output !== undefined)
        await settle(id, tokenCost(input, output, rate), input, output)
      return result
    },
    wrapStream: async ({ doStream }) => {
      const id = await reserve()
      const { stream, ...rest } = await doStream()
      return {
        ...rest,
        stream: stream.pipeThrough(
          new TransformStream({
            async transform(part, controller) {
              if (part.type === "finish") {
                const input = part.usage.inputTokens.total
                const output = part.usage.outputTokens.total
                if (input !== undefined && output !== undefined)
                  await settle(
                    id,
                    tokenCost(input, output, rate),
                    input,
                    output
                  )
              }
              controller.enqueue(part)
            },
          })
        ),
      }
    },
  }
}
