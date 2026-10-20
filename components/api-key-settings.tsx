"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { EyeIcon, EyeOffIcon, KeyRoundIcon } from "lucide-react"
import { saveApiKey, removeApiKey } from "@/actions/api-keys"
import { apiKeySchema, type ApiKeyProvider } from "@/lib/api-key-schema"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useSessionAction } from "@/hooks/use-session-action"

function ProviderKey({
  provider,
  saved,
}: {
  provider: ApiKeyProvider
  saved: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [removing, setRemoving] = useState(false)
  const [hasKey, setHasKey] = useState(saved)
  const [showKey, setShowKey] = useState(false)
  const sessionAction = useSessionAction()
  const form = useForm<z.infer<typeof apiKeySchema>>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { provider, key: "" },
  })
  const pending = form.formState.isSubmitting || removing
  const label =
    provider === "gemini"
      ? "Gemini"
      : provider === "openai"
        ? "OpenAI"
        : "OpenRouter"
  async function remove() {
    setError(undefined)
    setRemoving(true)
    try {
      const result = await sessionAction(() => removeApiKey(provider))
      if (result.error) {
        setError(result.error)
        return
      }
      form.reset({ provider, key: "" })
      setHasKey(false)
      setShowKey(false)
      toast.add({ title: `${label} key removed`, type: "success" })
      router.refresh()
    } catch {
      setError("Could not remove your key. Try again.")
    } finally {
      setRemoving(false)
    }
  }
  return (
    <section
      aria-labelledby={`${provider}-title`}
      className="flex min-w-0 flex-col gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${provider}-title`} className="text-lg font-semibold">
          {label}
        </h2>
        <Badge variant={hasKey ? "secondary" : "outline"} role="status">
          {hasKey ? "Using your key" : "Key required"}
        </Badge>
      </div>
      <form
        aria-label={`${label} API key settings`}
        onSubmit={form.handleSubmit(async (values) => {
          setError(undefined)
          try {
            const result = await sessionAction(() => saveApiKey(values))
            if (result.error) {
              setError(result.error)
              return
            }
            form.reset({ provider, key: "" })
            setHasKey(true)
            setShowKey(false)
            toast.add({ title: `${label} key saved`, type: "success" })
            router.refresh()
          } catch {
            setError("Could not save your key. Try again.")
          }
        })}
      >
        <FieldGroup>
          <Field
            data-invalid={!!form.formState.errors.key}
            data-disabled={pending}
          >
            <FieldLabel htmlFor={`${provider}-key`}>
              {hasKey ? "Replace API key" : "API key"}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${provider}-key`}
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  hasKey
                    ? "Paste a replacement key"
                    : `Paste your ${label} API key`
                }
                aria-invalid={!!form.formState.errors.key}
                disabled={pending}
                {...form.register("key")}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  aria-label={`${showKey ? "Hide" : "Show"} ${label} API key`}
                  aria-pressed={showKey}
                  disabled={pending}
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {hasKey
                ? "Your saved key stays private. Leave this blank to keep it."
                : "Add your own key to use this provider. Your provider bills AI usage."}
            </FieldDescription>
            <FieldError errors={[form.formState.errors.key]} />
          </Field>
          {error && <FieldError role="alert">{error}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              {form.formState.isSubmitting
                ? "Verifying key…"
                : `${hasKey ? "Replace" : "Save"} ${label} key`}
            </Button>
            {hasKey && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={remove}
                aria-label={`Remove ${label} key`}
              >
                {removing && <Spinner data-icon="inline-start" />}Remove key
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
    </section>
  )
}

export function ApiKeySettings({
  gemini,
  openrouter,
  openai = false,
}: {
  gemini: boolean
  openrouter: boolean
  openai?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <Alert>
        <KeyRoundIcon aria-hidden="true" />
        <AlertDescription>
          Keys are verified before saving and stored privately. Changes apply to
          your next message. Removing a key disables that provider.
        </AlertDescription>
      </Alert>
      <ProviderKey key={`gemini-${gemini}`} provider="gemini" saved={gemini} />
      <Separator />
      <ProviderKey
        key={`openrouter-${openrouter}`}
        provider="openrouter"
        saved={openrouter}
      />
      <Separator />
      <ProviderKey key={`openai-${openai}`} provider="openai" saved={openai} />
      <Separator />
      <p className="text-sm leading-relaxed text-muted-foreground">
        Your provider bills calls made with your key, including memory
        processing. Pro covers app access; there are no included AI credits.
        Your subscription and sandbox limits still apply.
      </p>
    </div>
  )
}
