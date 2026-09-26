"use client";

import { ImagePlusIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type BrandKit,
  type BrandKitInput,
  deleteBrandKit,
  saveBrandKit,
  uploadBrandAsset,
} from "./brand-kit-store";
import { STYLES } from "./studio-options";

const MAX_COLORS = 6;
const MAX_REFERENCES = 4;
const DEFAULT_COLORS = ["#d9432b", "#1f1f2b", "#f6f3ee"];

const EMPTY: BrandKitInput = {
  name: "",
  publicationName: "",
  colors: DEFAULT_COLORS,
  headingFont: "",
  bodyFont: "",
  preferredStyle: "",
  notes: "",
  referenceUrls: [],
};

function clean(input: BrandKitInput): BrandKitInput {
  const optional = (value?: string) => (value?.trim() ? value.trim() : undefined);
  return {
    ...input,
    name: input.name.trim(),
    publicationName: optional(input.publicationName),
    headingFont: optional(input.headingFont),
    bodyFont: optional(input.bodyFont),
    preferredStyle: optional(input.preferredStyle),
    notes: optional(input.notes),
  };
}

export function BrandKitDialog({
  kit,
  onOpenChange,
  onSaved,
  open,
}: {
  readonly kit?: BrandKit;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved?: (kit: BrandKit) => void;
  readonly open: boolean;
}) {
  const [draft, setDraft] = useState<BrandKitInput>(EMPTY);
  const [busy, setBusy] = useState<"saving" | "deleting" | "uploading" | undefined>();
  const [error, setError] = useState<string>();
  const formId = useId();

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setDraft(kit ? { ...EMPTY, ...kit } : EMPTY);
  }, [open, kit]);

  const patch = (next: Partial<BrandKitInput>) => setDraft((current) => ({ ...current, ...next }));

  const upload = async (files: FileList | null, apply: (urls: string[]) => void) => {
    if (!files?.length) return;
    setBusy("uploading");
    setError(undefined);
    try {
      apply(await Promise.all([...files].map(uploadBrandAsset)));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setBusy(undefined);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Give the kit a name.");
      return;
    }
    setBusy("saving");
    setError(undefined);
    try {
      const saved = await saveBrandKit(clean(draft), kit?.id);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the kit");
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    if (!kit) return;
    setBusy("deleting");
    try {
      await deleteBrandKit(kit.id);
      onOpenChange(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the kit");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="font-display text-xl uppercase tracking-wide">
            {kit ? "Edit brand kit" : "New brand kit"}
          </DialogTitle>
          <DialogDescription>
            Every infographic in a chat that uses this kit follows its logo, colors, type and past
            graphics.
          </DialogDescription>
        </DialogHeader>

        <form className="flex-1 space-y-5 overflow-y-auto p-5" id={formId} onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kit name" hint="Shown in the sidebar and composer">
              <Input
                autoFocus
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Morning Ledger"
                value={draft.name}
              />
            </Field>
            <Field label="Publication name" hint="Printed as the brand mark">
              <Input
                onChange={(event) => patch({ publicationName: event.target.value })}
                placeholder="THE MORNING LEDGER"
                value={draft.publicationName ?? ""}
              />
            </Field>
          </div>

          <Field label="Logo" hint="PNG with a transparent background works best">
            <div className="flex items-center gap-3">
              {draft.logoUrl ? (
                <Thumb onRemove={() => patch({ logoUrl: undefined })} url={draft.logoUrl} />
              ) : null}
              <UploadButton
                disabled={busy !== undefined}
                label={draft.logoUrl ? "Replace" : "Upload logo"}
                onFiles={(files) => upload(files, ([url]) => patch({ logoUrl: url }))}
              />
            </div>
          </Field>

          <Field label="Palette" hint="First color is the primary accent">
            <div className="flex flex-wrap items-center gap-2">
              {draft.colors.map((color, index) => (
                <ColorChip
                  color={color}
                  key={`${index}-${color}`}
                  onChange={(next) =>
                    patch({ colors: draft.colors.map((c, i) => (i === index ? next : c)) })
                  }
                  onRemove={() => patch({ colors: draft.colors.filter((_, i) => i !== index) })}
                />
              ))}
              {draft.colors.length < MAX_COLORS ? (
                <button
                  aria-label="Add color"
                  className="studio-button size-9 justify-center p-0"
                  onClick={() => patch({ colors: [...draft.colors, "#888888"] })}
                  type="button"
                >
                  <PlusIcon className="size-4" />
                </button>
              ) : null}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Headline font">
              <Input
                list={`${formId}-fonts`}
                onChange={(event) => patch({ headingFont: event.target.value })}
                placeholder="Oswald"
                value={draft.headingFont ?? ""}
              />
            </Field>
            <Field label="Body font">
              <Input
                list={`${formId}-fonts`}
                onChange={(event) => patch({ bodyFont: event.target.value })}
                placeholder="Inter"
                value={draft.bodyFont ?? ""}
              />
            </Field>
            <datalist id={`${formId}-fonts`}>
              {["Oswald", "Bebas Neue", "Futura", "Gotham", "Inter", "Roboto", "Playfair Display", "Georgia", "Didot", "IBM Plex Sans", "Space Grotesk", "Source Serif"].map(
                (font) => (
                  <option key={font} value={font} />
                ),
              )}
            </datalist>
          </div>

          <Field label="Default style">
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              onChange={(event) =>
                patch({ preferredStyle: event.target.value === "auto" ? "" : event.target.value })
              }
              value={draft.preferredStyle || "auto"}
            >
              {STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.id === "auto" ? "Let Plate choose" : style.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="House style notes" hint="Tone, texture, what to avoid">
            <Textarea
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="Warm paper texture, generous whitespace, never use gradients, headlines in all caps."
              rows={3}
              value={draft.notes ?? ""}
            />
          </Field>

          <Field
            label={`Past graphics (${draft.referenceUrls.length}/${MAX_REFERENCES})`}
            hint="New graphics match their look, never their content"
          >
            <div className="flex flex-wrap gap-2">
              {draft.referenceUrls.map((url) => (
                <Thumb
                  key={url}
                  large
                  onRemove={() => patch({ referenceUrls: draft.referenceUrls.filter((u) => u !== url) })}
                  url={url}
                />
              ))}
              {draft.referenceUrls.length < MAX_REFERENCES ? (
                <UploadButton
                  disabled={busy !== undefined}
                  label="Add"
                  multiple
                  onFiles={(files) =>
                    upload(files, (urls) =>
                      patch({
                        referenceUrls: [...draft.referenceUrls, ...urls].slice(0, MAX_REFERENCES),
                      }),
                    )
                  }
                  tall
                />
              ) : null}
            </div>
          </Field>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <DialogFooter className="flex-row items-center border-t p-4 sm:justify-between">
          {kit ? (
            <Button
              disabled={busy !== undefined}
              onClick={() => void remove()}
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-4" />
              {busy === "deleting" ? "Deleting…" : "Delete"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={busy !== undefined} form={formId} type="submit">
              {busy === "saving" ? "Saving…" : busy === "uploading" ? "Uploading…" : "Save kit"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  hint,
  label,
}: {
  readonly children: React.ReactNode;
  readonly hint?: string;
  readonly label: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="shrink-0 font-medium text-sm">{label}</span>
        {hint ? <span className="min-w-0 truncate text-muted-foreground text-xs">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ColorChip({
  color,
  onChange,
  onRemove,
}: {
  readonly color: string;
  readonly onChange: (color: string) => void;
  readonly onRemove: () => void;
}) {
  return (
    <span className="group relative flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-1">
      <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border border-white/20">
        <span className="absolute inset-0" style={{ background: color }} />
        <input
          aria-label={`Color ${color}`}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={color}
        />
      </label>
      <span className="font-mono text-xs uppercase tabular-nums">{color}</span>
      <button
        aria-label={`Remove ${color}`}
        className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        onClick={onRemove}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function Thumb({
  large,
  onRemove,
  url,
}: {
  readonly large?: boolean;
  readonly onRemove: () => void;
  readonly url: string;
}) {
  return (
    <span
      className={cn(
        "relative block overflow-hidden rounded-md border bg-muted",
        large ? "h-24 w-20" : "size-12",
      )}
    >
      {/* biome-ignore lint/performance/noImgElement: user-uploaded brand asset */}
      <img alt="" className="size-full object-cover object-top" src={url} />
      <button
        aria-label="Remove image"
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
        onClick={onRemove}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function UploadButton({
  disabled,
  label,
  multiple,
  onFiles,
  tall,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly multiple?: boolean;
  readonly onFiles: (files: FileList | null) => void;
  readonly tall?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className={cn(
          "studio-button border-dashed",
          tall && "h-24 w-20 flex-col justify-center rounded-md",
        )}
        disabled={disabled}
        onClick={() => input.current?.click()}
        type="button"
      >
        <ImagePlusIcon className="size-4" />
        {label}
      </button>
      <input
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        multiple={multiple}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
        ref={input}
        type="file"
      />
    </>
  );
}
