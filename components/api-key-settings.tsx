"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { saveApiKey, removeApiKey } from "@/actions/api-keys"
import { apiKeySchema, type ApiKeyProvider } from "@/lib/api-key-schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

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
  const form = useForm<z.infer<typeof apiKeySchema>>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { provider, key: "" },
  })
  const pending = form.formState.isSubmitting || removing
  const label = provider === "gemini" ? "Gemini" : "OpenRouter"
  async function remove() {
    setError(undefined)
    setRemoving(true)
    try {
      const result = await removeApiKey(provider)
      if (result.error) {
        setError(result.error)
        return
      }
      form.reset({ provider, key: "" })
      toast.add({ title: `${label} key removed`, type: "success" })
      router.refresh()
    } catch {
      setError("Could not remove your key. Try again.")
    } finally {
      setRemoving(false)
    }
  }
  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        setError(undefined)
        try {
          const result = await saveApiKey(values)
          if (result.error) {
            setError(result.error)
            return
          }
          form.reset({ provider, key: "" })
          toast.add({ title: `${label} key saved`, type: "success" })
          router.refresh()
        } catch {
          setError("Could not save your key. Try again.")
        }
      })}
    >
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.key}>
          <FieldLabel htmlFor={`${provider}-key`}>
            {label} API key {saved && "· Saved"}
          </FieldLabel>
          <Input
            id={`${provider}-key`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              saved ? "Enter a replacement key" : "Enter your API key"
            }
            aria-invalid={!!form.formState.errors.key}
            disabled={pending}
            {...form.register("key")}
          />
          <FieldError errors={[form.formState.errors.key]} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {form.formState.isSubmitting && (
              <Spinner data-icon="inline-start" />
            )}
            Save {label} key
          </Button>
          {saved && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={remove}
            >
              {removing && <Spinner data-icon="inline-start" />}Remove
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  )
}

export function ApiKeySettings({
  gemini,
  openrouter,
}: {
  gemini: boolean
  openrouter: boolean
}) {
  return (
    <section className="mx-auto mb-10 max-w-4xl space-y-6 rounded-xl border p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Your API keys</h2>
        <p className="text-sm text-muted-foreground">
          Use your own Gemini or OpenRouter account. Keys are stored privately
          on the server and never shown again. Your provider bills these calls
          directly, including memory processing; they do not use your app AI
          allowance. Your subscription and sandbox limits still apply. Remove a
          key to use the app’s key again. Changes apply to your next message.
        </p>
      </div>
      <ProviderKey provider="gemini" saved={gemini} />
      <ProviderKey provider="openrouter" saved={openrouter} />
    </section>
  )
}
