"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { getMemoryPreferences, updateMemoryPreferences } from "@/actions/memory"
import { usePaidAccess, handleBillingFailure } from "@/components/paid-access"
import { memoryPreferencesFormSchema } from "@/lib/db/schema"
import { defaultMemoryPreferences } from "@/lib/ai/memory-manager"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

const settings = [
  {
    key: "automaticMemory",
    label: "Remember useful information",
    description:
      "Save important facts and decisions. Off pauses new saves; existing memories remain available and can still be forgotten.",
  },
  {
    key: "globalMemory",
    label: "Global user memory",
    description:
      "Save personal facts and lasting preferences globally from both individual and group chats, so all your bots can recall them.",
  },
  {
    key: "groupMemory",
    label: "Group shared memory",
    description:
      "Keep group-specific notes available to every bot in that group.",
  },
  {
    key: "botMemoryInGroups",
    label: "Use individual bot notes in groups",
    description:
      "Allow a bot to recall its own private notes while responding in groups. Off keeps those notes out of group prompts.",
  },
] as const

export function MemorySettingsDialog({
  children,
}: {
  children: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const router = useRouter()
  const requirePaidAccess = usePaidAccess()
  const form = useForm<z.infer<typeof memoryPreferencesFormSchema>>({
    resolver: zodResolver(memoryPreferencesFormSchema),
    defaultValues: defaultMemoryPreferences,
  })
  const values = useWatch({ control: form.control })
  const pending = loading || form.formState.isSubmitting
  async function changeOpen(next: boolean) {
    if (next && !requirePaidAccess()) return
    if (pending) return
    setOpen(next)
    setError(undefined)
    if (!next) return
    setLoading(true)
    setLoaded(false)
    try {
      form.reset(await getMemoryPreferences())
      setLoaded(true)
    } catch {
      setError("Could not load your memory settings. Close and try again.")
    } finally {
      setLoading(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Memory & privacy</DialogTitle>
          <DialogDescription>
            Control what your bots remember and share. Settings apply to future
            responses; they do not remove past messages or saved notes.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit(async (input) => {
            if (!requirePaidAccess()) return
            setError(undefined)
            try {
              const result = await updateMemoryPreferences(input)
              if (handleBillingFailure(result)) return
              toast.add({ title: "Memory settings updated", type: "success" })
              setOpen(false)
              router.refresh()
            } catch {
              setError("Could not save your memory settings. Try again.")
            }
          })}
        >
          <FieldGroup>
            {settings.map(({ key, label, description }) => (
              <Field key={key} data-invalid={!!form.formState.errors[key]}>
                <FieldLabel id={`memory-${key}`}>{label}</FieldLabel>
                <FieldDescription>{description}</FieldDescription>
                <ToggleGroup
                  aria-labelledby={`memory-${key}`}
                  aria-invalid={!!form.formState.errors[key]}
                  disabled={pending}
                  variant="outline"
                  size="sm"
                  value={[values[key] ? "on" : "off"]}
                  onValueChange={(selected) => {
                    if (selected.length)
                      form.setValue(key, selected[0] === "on", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                  }}
                >
                  <ToggleGroupItem value="on">On</ToggleGroupItem>
                  <ToggleGroupItem value="off">Off</ToggleGroupItem>
                </ToggleGroup>
                <FieldError errors={[form.formState.errors[key]]} />
              </Field>
            ))}
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={pending}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={pending || !loaded}>
              {pending ? <Spinner data-icon="inline-start" /> : null}Save
              settings
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
