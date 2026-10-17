"use client"

import { useSessionAction } from "@/hooks/use-session-action"
import * as React from "react"
import { useRouter } from "next/navigation"
import { usePaidAccess, handleAccessFailure } from "@/components/paid-access"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import {
  createGroupChat,
  updateGroupChat,
  deleteGroupChat,
} from "@/actions/group-chat"
import { groupChatFormSchema } from "@/lib/db/schema"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  GroupChatAvatar,
  type GroupAvatarBot,
} from "@/components/group-chat-avatar"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  FieldError,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

export type GroupChatEdit = { id: string; name: string; botIds: string[] }

export function GroupChatDialog({
  bots,
  group,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  group?: GroupChatEdit
  bots: (GroupAvatarBot & { job: string })[]
  children?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [localOpen, setLocalOpen] = React.useState(false)
  const [serverError, setServerError] = React.useState<string>()
  const router = useRouter()
  const requirePaidAccess = usePaidAccess()
  const sessionAction = useSessionAction()
  const form = useForm<z.infer<typeof groupChatFormSchema>>({
    resolver: zodResolver(groupChatFormSchema),
    values: { name: group?.name ?? "", botIds: group?.botIds ?? [] },
  })
  const ids = useWatch({ control: form.control, name: "botIds" })
  const pending = form.formState.isSubmitting || deleting
  const errors = form.formState.errors
  function changeOpen(next: boolean) {
    if (next && !requirePaidAccess()) return
    if (pending) return
    if (!next) {
      form.reset()
      setServerError(undefined)
    }
    ;(onOpenChange ?? setLocalOpen)(next)
  }
  return (
    <Dialog open={controlledOpen ?? localOpen} onOpenChange={changeOpen}>
      {children ? <DialogTrigger render={children} /> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {group ? "Edit group chat" : "Create a group chat"}
          </DialogTitle>
          <DialogDescription>
            {group
              ? "Update the group name and its bots."
              : "Name your group and choose the bots to include."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-w-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (!requirePaidAccess()) return
            setServerError(undefined)
            try {
              const chat = group
                ? await sessionAction(() =>
                    updateGroupChat({ ...values, id: group.id })
                  )
                : await sessionAction(() => createGroupChat(values))
              if (handleAccessFailure(chat)) return
              toast.add({
                title: group ? "Group chat updated" : "Group chat created",
                description: group
                  ? `${values.name} is up to date.`
                  : `${values.name} is ready.`,
                type: "success",
              })
              form.reset()
              ;(onOpenChange ?? setLocalOpen)(false)
              if (!group) router.push(`/chats/${chat.id}`)
              router.refresh()
            } catch {
              setServerError(
                group
                  ? "Could not update the group. Check your selection and try again."
                  : "Could not create the group. Check your selection and try again."
              )
            }
          })}
        >
          <FieldGroup>
            <div className="flex items-center gap-3">
              <GroupChatAvatar
                bots={bots.filter((bot) => ids.includes(bot.id))}
                className="size-10"
              />
              <span className="text-sm text-muted-foreground">
                {ids.length} bots selected
              </span>
            </div>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="group-chat-name">Group name</FieldLabel>
              <Input
                id="group-chat-name"
                placeholder="Project team"
                aria-invalid={!!errors.name}
                disabled={pending}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <FieldSet data-invalid={!!errors.botIds}>
              <FieldLegend variant="label">Bots</FieldLegend>
              <FieldDescription>
                Choose at least two bots. Pick who responds before each message.
              </FieldDescription>
              <FieldGroup className="max-h-60 gap-2 overflow-y-auto p-1">
                {bots.map((bot) => (
                  <Field
                    key={bot.id}
                    orientation="horizontal"
                    data-invalid={!!errors.botIds}
                  >
                    <Checkbox
                      id={`group-bot-${bot.id}`}
                      disabled={pending}
                      checked={ids.includes(bot.id)}
                      aria-invalid={!!errors.botIds}
                      onCheckedChange={(checked) =>
                        form.setValue(
                          "botIds",
                          checked
                            ? [...ids, bot.id]
                            : ids.filter((id) => id !== bot.id),
                          { shouldValidate: true, shouldDirty: true }
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`group-bot-${bot.id}`}
                      className="min-w-0 flex-1"
                    >
                      <ChatAvatar
                        seed={bot.avatar}
                        className="size-8 shrink-0 rounded-full"
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{bot.name}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {bot.job}
                        </span>
                      </span>
                    </FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
              {bots.length < 2 ? (
                <FieldDescription>
                  Create at least two bots before starting a group chat.
                </FieldDescription>
              ) : null}
              <FieldError errors={[errors.botIds]} />
            </FieldSet>
            {serverError ? <FieldError>{serverError}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            {group ? (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      className="mr-auto"
                      disabled={pending}
                    />
                  }
                >
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the group chat. Its bots and their individual
                      chats are kept.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true)
                        setServerError(undefined)
                        try {
                          if (!requirePaidAccess()) return
                          const result = await sessionAction(() =>
                            deleteGroupChat({ id: group.id })
                          )
                          if (handleAccessFailure(result)) return
                          toast.add({
                            title: "Group chat deleted",
                            description: `${group.name} was deleted.`,
                            type: "success",
                          })
                          setConfirmOpen(false)
                          ;(onOpenChange ?? setLocalOpen)(false)
                          router.push("/dashboard")
                          router.refresh()
                        } catch {
                          setConfirmOpen(false)
                          setServerError(
                            "Could not delete the group chat. Try again."
                          )
                        } finally {
                          setDeleting(false)
                        }
                      }}
                    >
                      {deleting ? <Spinner data-icon="inline-start" /> : null}
                      Delete group chat
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || bots.length < 2}>
              {form.formState.isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {group ? "Save changes" : "Create group chat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
