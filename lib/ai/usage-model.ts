import { wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { getModel } from "./models"
import { currentUsagePeriod, reserveUsage, settleAI } from "../usage"
import { tokenCost, UsageLimitError } from "../usage-policy"

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
    return reserveUsage(periodId, "ai", 0, modelId)
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
    wrapGenerate: async ({ doGenerate }) => {
      const id = await reserve()
      // Record confirmed provider usage; pending calls do not consume an estimated ceiling.
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
