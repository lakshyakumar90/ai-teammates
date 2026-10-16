"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShuffleIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { createBot, deleteBot, updateBot } from "@/actions/bot";
import { usePaidAccess, handleBillingFailure } from "@/components/paid-access";
import { ChatAvatar } from "@/components/chat-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { insertBotSchema } from "@/lib/db/schema";
import { botPresets } from "@/lib/bot-presets";

const botFormSchema = insertBotSchema.omit({
  id: true,
  userId: true,
  sandboxId: true,
  createdAt: true,
  avatar: true,
});

type BotFormValues = z.infer<typeof botFormSchema>;

export type BotEdit = {
  id: string;
  name: string;
  job: string;
  instructions: string | null;
  avatar: string;
};

export function BotDialog({
  children,
  open: controlledOpen,
  onOpenChange,
  nativeButton = true,
  bot,
}: {
  children?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  nativeButton?: boolean;
  bot?: BotEdit;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const handleOpenChange = onOpenChange ?? setUncontrolledOpen;
  const [faceSeed, setFaceSeed] = React.useState(() => bot?.avatar ?? nanoid());
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const router = useRouter();
  const requirePaidAccess = usePaidAccess();

  const form = useForm<BotFormValues>({
    resolver: zodResolver(botFormSchema),
    defaultValues: {
      name: bot?.name ?? "Ada",
      job: bot?.job ?? botPresets[0].job,
      instructions: bot ? (bot.instructions ?? "") : botPresets[0].instructions,
    },
  });
  const job = form.watch("job");
  const errors = form.formState.errors;

  function handleDialogOpenChange(next: boolean) {
    if (next && !requirePaidAccess()) return;
    if (!next) {
      // Discard unsaved edits on close so reopening shows stored values.
      if (bot) {
        form.reset({
          name: bot.name,
          job: bot.job,
          instructions: bot.instructions ?? "",
        });
        setFaceSeed(bot.avatar);
      }
      setServerError(null);
    }
    handleOpenChange(next);
  }

  async function onSubmit(values: BotFormValues) {
    if (!requirePaidAccess()) return;
    setServerError(null);
    try {
      if (bot) {
        const result = await updateBot({ ...values, id: bot.id, avatar: faceSeed });
        if (handleBillingFailure(result)) return;
        toast.add({
          title: "Bot updated",
          description: `${values.name} is up to date.`,
          type: "success",
        });
      } else {
        const result = await createBot({ ...values, avatar: faceSeed });
        if (handleBillingFailure(result)) return;
        toast.add({
          title: "Bot created",
          description: `${values.name} is ready to chat.`,
          type: "success",
        });
        form.reset();
        setFaceSeed(nanoid());
      }
      handleOpenChange(false);
      router.refresh();
    } catch {
      setServerError(
        bot
          ? "Could not update the bot. Try again."
          : "Could not create the bot. Try again.",
      );
    }
  }

  async function handleDelete() {
    if (!requirePaidAccess()) return;
    if (!bot) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteBot({ id: bot.id });
      if (handleBillingFailure(result)) return;
      toast.add({
        title: "Bot deleted",
        description: `${bot.name} is gone.`,
        type: "success",
      });
      setConfirmOpen(false);
      handleOpenChange(false);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setConfirmOpen(false);
      setServerError("Could not delete the bot. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {children ? (
        <DialogTrigger render={children} nativeButton={nativeButton} />
      ) : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
          <DialogDescription>
            {bot
              ? "Update the face, name, and job."
              : "Give it a face, a name, and a job to do."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-w-0 flex-col gap-4"
        >
          <FieldGroup>
            <ToggleGroup
              variant="outline"
              value={job ? [job] : []}
              onValueChange={(groupValue) => {
                if (groupValue.length > 0) {
                  form.setValue("job", groupValue[0], {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  const preset = botPresets.find(
                    ({ job }) => job === groupValue[0],
                  );
                  if (preset) {
                    form.setValue("instructions", preset.instructions, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }
                }
              }}
            >
              {botPresets.map((preset) => (
                <ToggleGroupItem key={preset.job} value={preset.job}>
                  {preset.job}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="flex items-center gap-3">
              <ChatAvatar
                seed={faceSeed}
                animated
                className="size-12 rounded-full"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <FieldTitle>Face</FieldTitle>
                <FieldDescription>
                  Shuffle until you find one you like.
                </FieldDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFaceSeed(nanoid())}
              >
                <ShuffleIcon data-icon="inline-start" />
                Shuffle
              </Button>
            </div>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="bot-name">Name</FieldLabel>
              <Input
                id="bot-name"
                placeholder="Ada"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.job}>
              <FieldLabel htmlFor="bot-job">Job</FieldLabel>
              <Input
                id="bot-job"
                placeholder="What is the bot for?"
                aria-invalid={!!errors.job}
                {...form.register("job")}
              />
              <FieldError errors={[errors.job]} />
            </Field>
            <Field data-invalid={!!errors.instructions}>
              <FieldLabel htmlFor="bot-instructions">
                How it should work
              </FieldLabel>
              <Textarea
                id="bot-instructions"
                rows={4}
                placeholder="How should the bot go about the job?"
                aria-invalid={!!errors.instructions}
                {...form.register("instructions")}
              />
              <FieldError errors={[errors.instructions]} />
            </Field>
            {serverError ? <FieldError>{serverError}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            {bot ? (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      className="mr-auto"
                    />
                  }
                >
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the bot and its chat memberships.
                      This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? <Spinner data-icon="inline-start" /> : null}
                      Delete bot
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {bot ? "Save changes" : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
