"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShuffleIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { createBot } from "@/actions/bot";
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

const PRESETS = [
  "Research assistant",
  "Code reviewer",
  "Writing editor",
  "Tutor",
] as const;

const botFormSchema = insertBotSchema.omit({
  id: true,
  userId: true,
  sandboxId: true,
  createdAt: true,
  avatar: true,
});

type BotFormValues = z.infer<typeof botFormSchema>;

export function BotDialog({ children }: { children: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const [faceSeed, setFaceSeed] = React.useState(() => nanoid());
  const [serverError, setServerError] = React.useState<string | null>(null);
  const router = useRouter();

  const form = useForm<BotFormValues>({
    resolver: zodResolver(botFormSchema),
    defaultValues: {
      name: "Ada",
      job: "Research assistant",
      instructions:
        "Answer briefly, cite sources, and ask before running anything destructive.",
    },
  });
  const job = form.watch("job");
  const errors = form.formState.errors;

  async function onSubmit(values: BotFormValues) {
    setServerError(null);
    try {
      await createBot({ ...values, avatar: faceSeed });
      toast.add({
        title: "Bot created",
        description: `${values.name} is ready to chat.`,
        type: "success",
      });
      setOpen(false);
      form.reset();
      setFaceSeed(nanoid());
      router.refresh();
    } catch {
      setServerError("Could not create the bot. Try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New bot</DialogTitle>
          <DialogDescription>
            Give it a face, a name, and a job to do.
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
                }
              }}
            >
              {PRESETS.map((preset) => (
                <ToggleGroupItem key={preset} value={preset}>
                  {preset}
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
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Create bot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
