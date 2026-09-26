"use client";

import { ImagePlusIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const MAX_REFERENCES = 4;
const COLOR_ROLES = ["Primary", "Secondary", "Accent 1", "Accent 2", "Accent 3", "Accent 4"];
const DEFAULT_COLORS = ["#d9432b", "#1f1f2b", "#f6f3ee"];
const AUTO = "auto";
const FONTS = [
  "Anton",
  "Archivo Black",
  "Barlow Condensed",
  "Bebas Neue",
  "DM Serif Display",
  "Fraunces",
  "Futura",
  "Georgia",
  "Gotham",
  "Helvetica Neue",
  "IBM Plex Sans",
  "Inter",
  "Libre Baskerville",
  "Montserrat",
  "Oswald",
  "Playfair Display",
  "Poppins",
  "Roboto Condensed",
  "Source Serif",
  "Space Grotesk",
];

const EMPTY: BrandKitInput = {
  name: "",
  publicationName: "",
  colors: DEFAULT_COLORS,
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
  const [dialogElement, setDialogElement] = useState<HTMLDivElement | null>(null);
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
      setError("Add a kit name.");
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
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl"
        ref={setDialogElement}
      >
        <DialogHeader className="border-b p-5">
          <DialogTitle className="font-display text-xl uppercase tracking-wide">
            {kit ? "Edit brand kit" : "New brand kit"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Logo, colors, fonts and references applied to infographics.
          </DialogDescription>
        </DialogHeader>

        <form className="flex-1 space-y-5 overflow-y-auto p-5" id={formId} onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kit name">
              <Input
                autoFocus
                onChange={(event) => patch({ name: event.target.value })}
                value={draft.name}
              />
            </Field>
            <Field label="Publication name">
              <Input
                onChange={(event) => patch({ publicationName: event.target.value })}
                value={draft.publicationName ?? ""}
              />
            </Field>
          </div>

          <Field label="Logo">
            {draft.logoUrl ? (
              <Tile onRemove={() => patch({ logoUrl: undefined })} url={draft.logoUrl} />
            ) : (
              <UploadTile
                disabled={busy !== undefined}
                label="Upload"
                onFiles={(files) => upload(files, ([url]) => patch({ logoUrl: url }))}
              />
            )}
          </Field>

          <Field label="Palette">
            <div className="flex flex-wrap items-center gap-2">
              {draft.colors.map((color, index) => (
                <ColorChip
                  color={color}
                  key={`${index}-${color}`}
                  onChange={(next) =>
                    patch({ colors: draft.colors.map((c, i) => (i === index ? next : c)) })
                  }
                  onRemove={() => patch({ colors: draft.colors.filter((_, i) => i !== index) })}
                  role={COLOR_ROLES[index]}
                />
              ))}
              {draft.colors.length < COLOR_ROLES.length ? (
                <button
                  aria-label="Add color"
                  className="flex size-9 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground"
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
              <FontCombobox
                container={dialogElement}
                label="Headline font"
                onChange={(headingFont) => patch({ headingFont })}
                value={draft.headingFont}
              />
            </Field>
            <Field label="Body font">
              <FontCombobox
                container={dialogElement}
                label="Body font"
                onChange={(bodyFont) => patch({ bodyFont })}
                value={draft.bodyFont}
              />
            </Field>
          </div>

          <Field label="Style">
            <OptionSelect
              label="Style"
              onChange={(preferredStyle) => patch({ preferredStyle })}
              options={STYLES.filter((style) => style.id !== "auto").map((style) => ({
                id: style.id,
                label: style.label,
              }))}
              value={draft.preferredStyle}
            />
          </Field>

          <Field label="House style notes">
            <Textarea
              onChange={(event) => patch({ notes: event.target.value })}
              rows={3}
              value={draft.notes ?? ""}
            />
          </Field>

          <Field label="References">
            <div className="flex flex-wrap gap-2">
              {draft.referenceUrls.map((url) => (
                <Tile
                  key={url}
                  onRemove={() =>
                    patch({ referenceUrls: draft.referenceUrls.filter((u) => u !== url) })
                  }
                  url={url}
                />
              ))}
              {draft.referenceUrls.length < MAX_REFERENCES ? (
                <UploadTile
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

function Field({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return (
    <div className="space-y-1.5">
      <span className="block font-medium text-sm">{label}</span>
      {children}
    </div>
  );
}

const FONT_ITEMS = ["Auto", ...FONTS];

/** Searchable font list with an "Auto" default; undefined means auto. */
function FontCombobox({
  container,
  label,
  onChange,
  value,
}: {
  readonly container: HTMLElement | null;
  readonly label: string;
  readonly onChange: (value: string | undefined) => void;
  readonly value?: string;
}) {
  return (
    <Combobox
      autoHighlight
      items={FONT_ITEMS}
      onValueChange={(next: string | null) => onChange(next && next !== "Auto" ? next : undefined)}
      value={value && FONTS.includes(value) ? value : "Auto"}
    >
      <ComboboxInput
        aria-label={label}
        className="w-full"
        // Enter picks the highlighted font; it must not submit the kit form around it.
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="Auto"
      />
      <ComboboxContent container={container}>
        <ComboboxEmpty>No fonts found.</ComboboxEmpty>
        <ComboboxList className="max-h-64">
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** shadcn Select with an "Auto" default; undefined means auto. */
function OptionSelect({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string | undefined) => void;
  readonly options: readonly { id: string; label: string }[];
  readonly value?: string;
}) {
  return (
    <Select
      onValueChange={(next) => next && onChange(next === AUTO ? undefined : next)}
      value={value && options.some((option) => option.id === value) ? value : AUTO}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72" position="popper">
        <SelectItem value={AUTO}>Auto</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ColorChip({
  color,
  onChange,
  onRemove,
  role,
}: {
  readonly color: string;
  readonly onChange: (color: string) => void;
  readonly onRemove: () => void;
  readonly role?: string;
}) {
  return (
    <span className="flex items-center gap-2 rounded-full border py-1 pr-1.5 pl-1">
      <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-full border border-foreground/15">
        <span className="absolute inset-0" style={{ background: color }} />
        <input
          aria-label={`${role} color`}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={color}
        />
      </label>
      <span className="flex flex-col leading-tight">
        <span className="text-xs">{role}</span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
          {color}
        </span>
      </span>
      <button
        aria-label={`Remove ${role} color`}
        className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        onClick={onRemove}
        type="button"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

const TILE = "relative flex size-full overflow-hidden rounded-md border";

/** Square slot for logo and reference thumbnails. */
function Square({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="w-20 shrink-0">
      <AspectRatio ratio={1}>{children}</AspectRatio>
    </div>
  );
}

function Tile({ onRemove, url }: { readonly onRemove: () => void; readonly url: string }) {
  return (
    <Square>
    <span className={cn(TILE, "bg-muted")}>
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
    </Square>
  );
}

function UploadTile({
  disabled,
  label,
  multiple,
  onFiles,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly multiple?: boolean;
  readonly onFiles: (files: FileList | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Square>
      <button
        className={cn(
          TILE,
          "flex-col items-center justify-center gap-1 border-dashed text-muted-foreground text-xs transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50",
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
    </Square>
  );
}
