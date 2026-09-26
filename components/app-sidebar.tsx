"use client";

import {
  ArrowUpRightIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandKitDialog } from "@/app/_components/brand-kit-dialog";
import { type BrandKit, useBrandKits } from "@/app/_components/brand-kit-store";
import {
  type ChatEntry,
  chatActions,
  chatUrl,
  useBackfillTitles,
  useChats,
} from "@/app/_components/chat-store";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const PAGE_SIZE = 12;

export function AppSidebar({
  account,
  activeSessionId,
  onUseBrandKit,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  readonly account?: React.ReactNode;
  readonly activeSessionId?: string;
  readonly onUseBrandKit?: (kitId: string) => void;
}) {
  const chats = useChats();
  const [searchOpen, setSearchOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const live = useMemo(
    () =>
      chats
        .filter((chat) => !chat.trashedAt)
        .sort(
          (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt,
        ),
    [chats],
  );
  const trashed = chats.filter((chat) => chat.trashedAt);
  useBackfillTitles(live);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <a className="flex items-center gap-2 px-2 py-1.5" href="/">
          <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-primary font-display font-semibold text-sidebar-primary-foreground text-sm">
            P
          </span>
          <span className="font-display text-base uppercase tracking-[0.18em]">Plate</span>
        </a>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setSearchOpen(true)}>
              <SearchIcon />
              <span>Search</span>
              <kbd className="ml-auto font-sans text-sidebar-foreground/50 text-xs">⌘K</kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={!activeSessionId}>
              <a href="/s">
                <PlusIcon />
                <span>New</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavChats activeSessionId={activeSessionId} chats={live} />
        <NavBrandKits activeSessionId={activeSessionId} onUseBrandKit={onUseBrandKit} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setTrashOpen(true)}>
              <Trash2Icon />
              <span>Trash</span>
              {trashed.length ? (
                <span className="ml-auto text-sidebar-foreground/50 text-xs tabular-nums">
                  {trashed.length}
                </span>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <ModeToggle />
        </SidebarMenu>
        {account ? <div className="px-2 pb-1">{account}</div> : null}
      </SidebarFooter>
      <SidebarRail />

      <SearchChats chats={live} onOpenChange={setSearchOpen} open={searchOpen} />
      <TrashDialog chats={trashed} onOpenChange={setTrashOpen} open={trashOpen} />
    </Sidebar>
  );
}

function NavChats({
  activeSessionId,
  chats,
}: {
  readonly activeSessionId?: string;
  readonly chats: ChatEntry[];
}) {
  const { isMobile } = useSidebar();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [renaming, setRenaming] = useState<ChatEntry>();

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarMenu>
        {chats.length === 0 ? (
          <p className="px-2 py-1 text-sidebar-foreground/60 text-xs">
            No chats yet
          </p>
        ) : null}
        {chats.slice(0, visible).map((chat) => (
          <SidebarMenuItem key={chat.sessionId}>
            <SidebarMenuButton asChild isActive={chat.sessionId === activeSessionId}>
              <a href={chatUrl(chat.sessionId)} title={chat.title}>
                <span className="truncate">{chat.title}</span>
                {chat.favorite ? (
                  <StarIcon aria-label="Favorite" className="ml-auto size-3 fill-current text-signal" />
                ) : null}
              </a>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover>
                  <MoreHorizontalIcon />
                  <span className="sr-only">Chat actions</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isMobile ? "end" : "start"}
                className="w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
              >
                <ChatMenuItems chat={chat} onRename={() => setRenaming(chat)} />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        {chats.length > visible ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-sidebar-foreground/70"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              <MoreHorizontalIcon />
              <span>More</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
      </SidebarMenu>
      <RenameDialog chat={renaming} onClose={() => setRenaming(undefined)} />
    </SidebarGroup>
  );
}

/** Shared chat actions for the sidebar row menu. */
export function ChatMenuItems({
  chat,
  onRename,
}: {
  readonly chat: ChatEntry;
  readonly onRename: () => void;
}) {
  return (
    <>
      <DropdownMenuItem onSelect={() => chatActions.toggleFavorite(chat.sessionId)}>
        {chat.favorite ? (
          <StarOffIcon className="text-muted-foreground" />
        ) : (
          <StarIcon className="text-muted-foreground" />
        )}
        <span>{chat.favorite ? "Remove from favorites" : "Add to favorites"}</span>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onRename}>
        <PencilIcon className="text-muted-foreground" />
        <span>Rename</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() =>
          void navigator.clipboard.writeText(new URL(chatUrl(chat.sessionId), location.origin).href)
        }
      >
        <LinkIcon className="text-muted-foreground" />
        <span>Copy link</span>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => window.open(chatUrl(chat.sessionId), "_blank", "noopener")}>
        <ArrowUpRightIcon className="text-muted-foreground" />
        <span>Open in new tab</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => chatActions.trash(chat.sessionId)} variant="destructive">
        <Trash2Icon />
        <span>Move to trash</span>
      </DropdownMenuItem>
    </>
  );
}

export function RenameDialog({
  chat,
  onClose,
}: {
  readonly chat?: ChatEntry;
  readonly onClose: () => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(chat?.title ?? ""), [chat]);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={chat !== undefined}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (chat && value.trim()) chatActions.rename(chat.sessionId, value);
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input autoFocus onChange={(event) => setValue(event.target.value)} value={value} />
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!value.trim()} type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NavBrandKits({
  activeSessionId,
  onUseBrandKit,
}: {
  readonly activeSessionId?: string;
  readonly onUseBrandKit?: (kitId: string) => void;
}) {
  const { kits, status } = useBrandKits();
  const { isMobile } = useSidebar();
  const [editing, setEditing] = useState<{ kit?: BrandKit } | undefined>();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Brand kits</SidebarGroupLabel>
      <SidebarGroupAction onClick={() => setEditing({})} title="New brand kit">
        <PlusIcon />
        <span className="sr-only">New brand kit</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {status === "loading" && kits.length === 0 ? (
            <p className="px-2 py-1 text-sidebar-foreground/60 text-xs">Loading kits…</p>
          ) : null}
          {status === "error" ? (
            <p className="px-2 py-1 text-destructive text-xs">Could not load brand kits.</p>
          ) : null}
          {status === "ready" && kits.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton className="text-sidebar-foreground/70" onClick={() => setEditing({})}>
                <PlusIcon />
                <span>Create a brand kit</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {kits.map((kit) => (
            <SidebarMenuItem key={kit.id}>
              <SidebarMenuButton onClick={() => setEditing({ kit })} title={kit.name}>
                <KitSwatch kit={kit} />
                <span className="truncate">{kit.name}</span>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <MoreHorizontalIcon />
                    <span className="sr-only">Brand kit actions</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isMobile ? "end" : "start"}
                  className="w-56 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                >
                  {onUseBrandKit ? (
                    <DropdownMenuItem onSelect={() => onUseBrandKit(kit.id)}>
                      <PlusIcon className="text-muted-foreground" />
                      <span>{activeSessionId ? "Use in this chat" : "Use in new chat"}</span>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => setEditing({ kit })}>
                    <PencilIcon className="text-muted-foreground" />
                    <span>Edit kit</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
      <BrandKitDialog
        kit={editing?.kit}
        onOpenChange={(open) => !open && setEditing(undefined)}
        open={editing !== undefined}
      />
    </SidebarGroup>
  );
}

export function KitSwatch({ kit }: { readonly kit: BrandKit }) {
  if (kit.logoUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: user-uploaded brand logo
      <img alt="" className="size-4 shrink-0 rounded-sm bg-white object-contain" src={kit.logoUrl} />
    );
  }
  const [a = "#888888", b = a] = kit.colors;
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 rounded-sm border border-foreground/15"
      style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }}
    />
  );
}

function SearchChats({
  chats,
  onOpenChange,
  open,
}: {
  readonly chats: ChatEntry[];
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <CommandDialog
      description="Search chat titles and conversations"
      // Substring match, titles first: fuzzy matching turns long transcripts into false hits.
      filter={(value, search, keywords) => {
        const query = search.trim().toLowerCase();
        if (!query) return 1;
        if (value.toLowerCase().includes(query)) return 1;
        return keywords?.some((keyword) => keyword.toLowerCase().includes(query)) ? 0.5 : 0;
      }}
      onOpenChange={onOpenChange}
      open={open}
      title="Search chats"
    >
      <CommandInput placeholder="Search chats…" />
      <CommandList>
        <CommandEmpty>No chats found.</CommandEmpty>
        <CommandGroup heading="Chats">
          {chats.map((chat) => (
            <CommandItem
              key={chat.sessionId}
              keywords={[chat.searchText]}
              onSelect={() => window.location.assign(chatUrl(chat.sessionId))}
              value={`${chat.title} ${chat.sessionId}`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {chat.thumbnailUrl ? (
                  // biome-ignore lint/performance/noImgElement: remote GMI asset thumbnail
                  <img alt="" className="size-full object-cover object-top" src={chat.thumbnailUrl} />
                ) : (
                  <SearchIcon className="size-4 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{chat.title}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {chat.searchText.slice(0, 120)}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function TrashDialog({
  chats,
  onOpenChange,
  open,
}: {
  readonly chats: ChatEntry[];
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription className="sr-only">Chats moved to trash</DialogDescription>
        </DialogHeader>
        {chats.length === 0 ? (
          <p className="text-muted-foreground text-sm">Trash is empty.</p>
        ) : (
          <ul className="-mx-2 max-h-80 space-y-1 overflow-y-auto">
            {chats.map((chat) => (
              <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent" key={chat.sessionId}>
                <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                <Button
                  aria-label={`Restore ${chat.title}`}
                  onClick={() => chatActions.restore(chat.sessionId)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <RotateCcwIcon />
                </Button>
                <Button
                  aria-label={`Delete ${chat.title} forever`}
                  onClick={() => chatActions.deleteForever(chat.sessionId)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
