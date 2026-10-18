import type { Sandbox } from "@daytona/sdk"
import { tool } from "ai"
import { z } from "zod"
import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"

import { getChatBot } from "./bot-context"
import { managedSandbox } from "../sandbox-usage"
import { requireUserPaidPlan } from "../billing-agent"
import { logger, errorType } from "../logging"
import { ChatRequestError, chatErrorMessage } from "./chat-error"

const point = {
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
}
const path = z.string().min(1).describe("Path inside the bot's Daytona sandbox")
const maxText = 32_000
const truncate = (text: string) =>
  text.length > maxText ? `${text.slice(0, maxText)}\n[Output truncated]` : text

export async function getChatSandbox(chatId: string, botId?: string) {
  const bot = await getChatBot(chatId, botId)
  await requireUserPaidPlan(bot.userId)
  if (!bot.sandboxId)
    throw new ChatRequestError("This bot has no Daytona sandbox.")
  return managedSandbox(bot.userId, bot.sandboxId)
}

export function createComputerTools(
  resolveSandbox: () => Promise<Sandbox>,
  supportsImages: boolean
) {
  let queue: Promise<unknown> = Promise.resolve()
  const blockedScrolls = new Set<string>()
  const screenHash = (image: string) =>
    createHash("sha256").update(image).digest("hex")

  // Models can request several actions in one step. Preserve desktop/file order.
  function run<T>(
    operation: (sandbox: Sandbox) => Promise<T>,
    signal?: AbortSignal,
    desktop = false
  ): Promise<T> {
    const result = queue.then(async () => {
      signal?.throwIfAborted()
      const startedAt = Date.now()
      try {
        const sandbox = await resolveSandbox()
        signal?.throwIfAborted()
        if (desktop) {
          await sandbox.computerUse.start()
          signal?.throwIfAborted()
        }
        const output = await operation(sandbox)
        signal?.throwIfAborted()
        logger.debug("Sandbox tool completed", {
          desktop,
          duration_ms: Date.now() - startedAt,
        })
        return output
      } catch (error) {
        if (signal?.aborted) throw signal.reason
        logger.error("Sandbox tool failed", {
          desktop,
          duration_ms: Date.now() - startedAt,
          "error.type": errorType(error),
        })
        throw new ChatRequestError(chatErrorMessage(error))
      }
    })
    queue = result.catch(() => undefined)
    return result
  }

  function requireVision() {
    if (!supportsImages) {
      throw new ChatRequestError(
        "Select an image-capable model for desktop interaction."
      )
    }
  }

  async function screenshot(signal?: AbortSignal) {
    return run(
      async (sandbox) => {
        const result = await sandbox.computerUse.screenshot.takeFullScreen()
        if (!result.screenshot)
          throw new ChatRequestError(
            "The sandbox returned an empty screenshot."
          )
        return {
          image: result.screenshot.replace(/^data:image\/png;base64,/, ""),
          mediaType: "image/png" as const,
        }
      },
      signal,
      true
    )
  }

  return {
    bash: tool({
      description:
        "Run a shell command in this bot's Daytona sandbox. Returns exit code and output. Desktop display is :0; call viewScreen first to initialize desktop services before launching GUI apps. Launch long-running GUI apps in the background and redirect their output.",
      inputSchema: z.object({
        command: z.string().min(1),
        cwd: z.string().optional(),
        timeout: z.number().int().min(1).max(120).default(60),
      }),
      execute: ({ command, cwd, timeout }, { abortSignal }) =>
        run(async (sandbox) => {
          const result = await sandbox.process.executeCommand(
            command,
            cwd,
            { DISPLAY: ":0" },
            timeout
          )
          return { exitCode: result.exitCode, output: truncate(result.result) }
        }, abortSignal),
    }),
    readFile: tool({
      description: "Read a UTF-8 text file inside this bot's sandbox.",
      inputSchema: z.object({ path }),
      execute: ({ path }, { abortSignal }) =>
        run(async (sandbox) => {
          const info = await sandbox.fs.getFileDetails(path)
          if (info.size > 1024 * 1024)
            throw new ChatRequestError(
              "File is too large to read. Use bash to inspect a smaller section."
            )
          return {
            path,
            content: truncate(
              (await sandbox.fs.downloadFile(path)).toString("utf8")
            ),
          }
        }, abortSignal),
    }),
    writeFile: tool({
      description:
        "Create or replace a UTF-8 text file inside this bot's sandbox.",
      inputSchema: z.object({ path, content: z.string().max(200_000) }),
      execute: ({ path, content }, { abortSignal }) =>
        run(async (sandbox) => {
          await sandbox.fs.uploadFile(Buffer.from(content, "utf8"), path)
          return { path, written: true }
        }, abortSignal),
    }),
    listFiles: tool({
      description: "List files and directories inside this bot's sandbox.",
      inputSchema: z.object({ path: path.default(".") }),
      execute: ({ path }, { abortSignal }) =>
        run(async (sandbox) => {
          const files = await sandbox.fs.listFiles(path)
          return {
            path,
            files: files.slice(0, 500).map(({ name, isDir, size }) => ({
              name,
              isDirectory: isDir,
              size,
            })),
            truncated: files.length > 500,
          }
        }, abortSignal),
    }),
    mouseClick: tool({
      description:
        "Click at observed screen coordinates in the sandbox desktop. Inspect the screen first.",
      inputSchema: z.object({
        ...point,
        button: z.enum(["left", "right", "middle"]).default("left"),
        doubleClick: z.boolean().default(false),
      }),
      execute: ({ x, y, button, doubleClick }, { abortSignal }) => {
        requireVision()
        return run(
          async (sandbox) => {
            await sandbox.computerUse.mouse.click(x, y, button, doubleClick)
            return { clicked: true }
          },
          abortSignal,
          true
        )
      },
    }),
    mouseMove: tool({
      description:
        "Move the mouse to observed screen coordinates in the sandbox desktop.",
      inputSchema: z.object(point),
      execute: ({ x, y }, { abortSignal }) => {
        requireVision()
        return run(
          async (sandbox) => {
            await sandbox.computerUse.mouse.move(x, y)
            return { moved: true }
          },
          abortSignal,
          true
        )
      },
    }),
    mouseScroll: tool({
      description:
        "Scroll at observed coordinates. Amount is wheel ticks. Returns a private screen observation and whether the screen changed. If no progress or blocked, stop repeating this scroll: inspect the visible content, try a different scroll container, or answer the user. A wheel event alone does not prove movement or reaching the bottom.",
      inputSchema: z.object({
        ...point,
        direction: z.enum(["up", "down"]),
        amount: z.number().int().min(1).max(50).default(3),
      }),
      execute: ({ x, y, direction, amount }, { abortSignal }) => {
        requireVision()
        return run(
          async (sandbox) => {
            const before = await sandbox.computerUse.screenshot.takeFullScreen()
            if (!before.screenshot)
              throw new ChatRequestError(
                "Could not observe the screen before scrolling."
              )
            const signature = `${screenHash(before.screenshot)}:${x}:${y}:${direction}`
            if (blockedScrolls.has(signature))
              return {
                scrollEventSent: false,
                screenChanged: false,
                blocked: true,
                message:
                  "This scroll already made no progress on this screen. No wheel event was sent. Read the visible content or choose a different action.",
                image: before.screenshot.replace(
                  /^data:image\/png;base64,/,
                  ""
                ),
              }
            await sandbox.computerUse.mouse.scroll(x, y, direction, amount)
            await delay(400, undefined, { signal: abortSignal })
            const after = await sandbox.computerUse.screenshot.takeFullScreen()
            if (!after.screenshot)
              throw new ChatRequestError(
                "Could not verify scrolling. Inspect the screen before another action."
              )
            const screenChanged =
              screenHash(before.screenshot) !== screenHash(after.screenshot)
            if (!screenChanged) blockedScrolls.add(signature)
            return {
              scrollEventSent: true,
              screenChanged,
              blocked: false,
              message: screenChanged
                ? "Screen changed. Inspect this observation before choosing the next action; stop once the requested content is visible."
                : "No visible progress. You may be at the page boundary or over a non-scrollable area. Do not repeat this scroll. Read the visible content or change approach.",
              image: after.screenshot.replace(/^data:image\/png;base64,/, ""),
            }
          },
          abortSignal,
          true
        )
      },
      toModelOutput: ({ output }) =>
        supportsImages
          ? {
              type: "content",
              value: [
                {
                  type: "text",
                  text: JSON.stringify({ ...output, image: undefined }),
                },
                {
                  type: "file",
                  mediaType: "image/png",
                  data: { type: "data", data: output.image },
                },
              ],
            }
          : { type: "text", value: output.message },
    }),
    keyboardType: tool({
      description: "Type text into the focused control in the sandbox desktop.",
      inputSchema: z.object({ text: z.string().max(20_000) }),
      execute: ({ text }, { abortSignal }) => {
        requireVision()
        return run(
          async (sandbox) => {
            await sandbox.computerUse.keyboard.type(text)
            return { typed: true }
          },
          abortSignal,
          true
        )
      },
    }),
    keyboardPress: tool({
      description:
        "Press a desktop key, optionally with ctrl, alt, shift, or cmd modifiers. Examples: enter; key l with ctrl.",
      inputSchema: z.object({
        key: z.string().min(1),
        modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).optional(),
      }),
      execute: ({ key, modifiers }, { abortSignal }) => {
        requireVision()
        return run(
          async (sandbox) => {
            await sandbox.computerUse.keyboard.press(key, modifiers)
            return { pressed: true }
          },
          abortSignal,
          true
        )
      },
    }),
    viewScreen: tool({
      description:
        "Inspect the current sandbox screen privately to plan and verify desktop actions. This screenshot is never displayed in chat. Requires an image-capable model.",
      inputSchema: z.object({}),
      execute: (_, { abortSignal }) => {
        requireVision()
        return screenshot(abortSignal)
      },
      toModelOutput: ({ output }) =>
        supportsImages
          ? {
              type: "content",
              value: [
                {
                  type: "file",
                  mediaType: output.mediaType,
                  data: { type: "data", data: output.image },
                },
              ],
            }
          : {
              type: "text",
              value:
                "A private screen observation was made with a vision model. Select an image-capable model to inspect the screen again.",
            },
    }),
    showScreen: tool({
      description:
        "Capture and display the current sandbox screen in chat. Call only when the user explicitly asks to see the screen; use viewScreen for private observations.",
      inputSchema: z.object({}),
      execute: (_, { abortSignal }) => screenshot(abortSignal),
      toModelOutput: () => ({
        type: "text",
        value: "The sandbox screenshot was displayed to the user.",
      }),
    }),
  }
}
