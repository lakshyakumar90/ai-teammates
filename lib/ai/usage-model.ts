import { wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { getModel, modelEntry } from "./models"
import { getUserApiKeys } from "./user-api-keys"
import { requireUserPaidPlan } from "../billing-agent"
import { chatGPTModel } from "./chatgpt-model"
import { communityChatGPTModel } from "./community-chatgpt-model"
export function personalModelMiddleware(
  checkAccess: () => Promise<unknown>
): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => {
      await checkAccess()
      return params
    },
  }
}
// Includes memory extraction, tool steps and retries. Never bills app AI credits.
export async function meteredModel(modelId: string, userId: string) {
  await requireUserPaidPlan(userId)
  const resolveModel = async () =>
    modelId.startsWith("chatgpt-community:")
      ? communityChatGPTModel(
          userId,
          modelId.slice("chatgpt-community:".length)
        )
      : modelId.startsWith("chatgpt:")
        ? await chatGPTModel(userId, modelId.slice(8))
        : getModel(
            modelId,
            (await getUserApiKeys(userId))[modelEntry(modelId).keyProvider]
          )
  const model = await resolveModel()
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ params }) => {
        await requireUserPaidPlan(userId)
        return (await resolveModel()).doGenerate(params)
      },
      wrapStream: async ({ params }) => {
        await requireUserPaidPlan(userId)
        return (await resolveModel()).doStream(params)
      },
    },
  })
}
