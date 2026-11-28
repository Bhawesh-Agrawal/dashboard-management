"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  CheckSquare,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  ListChecks,
  MoreHorizontal,
  Network,
  Pin,
  Plus,
  Quote,
  Search,
  Share2,
  Tag,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { CaptureSheet } from "./CaptureSheet";
import { DocumentLibrary } from "./DocumentLibrary";
import { VaultImportDialog } from "./VaultImportDialog";
import { DailyNoteButton } from "./DailyNoteButton";
import { MeetingMinutesEditor } from "./MeetingMinutesEditor";
import { QuoteEditor } from "./QuoteEditor";
import { StepsChecklistEditor } from "./StepsChecklistEditor";
import {
  addTagToNote,
  convertNoteToTask,
  fetchInboxNotesAction,
  toggleNoteArchive,
  toggleNotePin,
} from "../lib/capture-actions";
import { summarizeLinkNoteAction } from "../lib/notes-ai-actions";
import { deleteNote } from "../lib/actions";
import type { InboxFilter, InboxNoteRow } from "../lib/inbox-queries";
import type {
  ChecklistMeta,
  LinkMeta,
  MeetingMeta,
  QuoteMeta,
} from "../lib/capture-types";
import { formatMeetingPlainText } from "../lib/meeting-format";

type FilterChipValue = InboxFilter | "files";

const FILTER_CHIPS: Array<{ value: FilterChipValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "link", label: "Links" },
  { value: "quote", label: "Quotes" },
  { value: "meeting", label: "Meetings" },
  { value: "checklist", label: "Steps" },
  { value: "note", label: "Notes" },
  { value: "files", label: "Files" },
  { value: "pinned", label: "Pinned" },
  { value: "archived", label: "Archived" },
];

function formatRelativeTime(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getKindIcon(kind: string) {
  switch (kind) {
    case "link":
      return Link2;
    case "quote":
      return Quote;
    case "meeting":
      return Users;
    case "checklist":
      return ListChecks;
    default:
      return FileText;
  }
}

function formatContentTypeLabel(contentType?: string): string | null {
  switch (contentType) {
    case "youtube_video":
      return "YouTube";
    case "youtube_playlist":
      return "YouTube Playlist";
    case "spotify_playlist":
      return "Spotify Playlist";
    case "spotify_album":
      return "Spotify Album";
    case "spotify_track":
      return "Spotify Track";
    case "spotify_episode":
      return "Spotify Episode";
    case "article":
      return "Article";
    default:
      return null;
  }
}

export interface NotesInboxClientProps {
  initialNotes: InboxNoteRow[];
  openCaptureOnMount?: boolean;
}

export function NotesInboxClient({
  initialNotes,
  openCaptureOnMount = false,
}: NotesInboxClientProps) {
  const [notes, setNotes] = useState<InboxNoteRow[]>(initialNotes);
  const [filter, setFilter] = useState<FilterChipValue>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(openCaptureOnMount);
  const [importOpen, setImportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const refreshInbox = useCallback(
    async (nextFilter: FilterChipValue = filter, nextSearch: string = search) => {
      if (nextFilter === "files") return;
      setLoading(true);
      const res = await fetchInboxNotesAction({
        filter: nextFilter,
        search: nextSearch,
        limit: 50,
      });
      setLoading(false);
      if (res.ok) {
        setNotes(res.data);
      }
    },
    [filter, search]
  );

  // Debounced server-side search & filter
  useEffect(() => {
    if (filter === "files") return;
    const timer = setTimeout(() => {
      void refreshInbox(filter, search);
    }, 220);
    return () => clearTimeout(timer);
  }, [filter, search, refreshInbox]);

  async function handlePin(id: string) {
    const res = await toggleNotePin(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.isPinned ? "Pinned" : "Unpinned");
    void refreshInbox();
  }

  async function handleArchive(id: string) {
    const res = await toggleNoteArchive(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.archived ? "Archived" : "Restored from archive");
    void refreshInbox();
  }

  async function handleDelete(id: string) {
    const res = await deleteNote(id);
    setConfirmDeleteId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Deleted");
    void refreshInbox();
  }

  async function handleCopy(row: InboxNoteRow) {
    const text =
      row.kind === "meeting" && row.meta
        ? formatMeetingPlainText(
            row.title || "Meeting",
            row.meta as MeetingMeta,
            row.content
          )
        : row.sourceLink || row.content;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function handleShare(row: InboxNoteRow) {
    const text =
      row.kind === "meeting" && row.meta
        ? formatMeetingPlainText(
            row.title || "Meeting",
            row.meta as MeetingMeta,
            row.content
          )
        : row.content;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: row.title || "Note",
          text,
          ...(row.sourceLink ? { url: row.sourceLink } : {}),
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopy(row);
  }

  async function handleAddTag(id: string) {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    const res = await addTagToNote(id, trimmed);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTagInput("");
    setTaggingId(null);
    toast.success("Tag added");
    void refreshInbox();
  }

  async function handleConvertToTask(id: string) {
    const res = await convertNoteToTask(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Task created");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="page-heading">Notes</h1>
          <p className="text-xs text-muted-foreground">Capture inbox</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Capture
          </button>

          <div className="relative">
            <button
              type="button"
              aria-label="More notes options"
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-border bg-card p-1.5 shadow-lg space-y-1">
                <Link
                  href="/notes/graph"
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                >
                  <Network className="h-4 w-4" aria-hidden="true" />
                  Knowledge Graph
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    setImportOpen(true);
                  }}
                  className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Vault Import
                </button>
                <div className="px-1 py-1">
                  <DailyNoteButton />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      {filter !== "files" && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles, text, URLs, or #tags..."
            className="w-full min-h-[44px] rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => setFilter(chip.value)}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {chip.value === "files" && <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />}
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Files tab -> DocumentLibrary */}
      {filter === "files" ? (
        <DocumentLibrary onFolderSelect={() => {}} searchQuery={search} />
      ) : (
        <div className="space-y-2">
          {loading && notes.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading inbox...</p>
          )}

          {!loading && notes.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">No captures yet</p>
              <p className="text-xs text-muted-foreground">
                Save a link, quote, meeting note, or list of steps in one tap.
              </p>
            </div>
          )}

          {notes.map((row) => {
            const Icon = getKindIcon(row.kind);
            const linkMeta =
              row.kind === "link" && row.meta && typeof row.meta === "object"
                ? (row.meta as Partial<LinkMeta>)
                : null;
            const href = row.sourceLink || row.originalUrl || linkMeta?.url || null;
            const host = linkMeta?.host || (href ? (() => { try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return null; } })() : null);
            const contentTypeLabel = formatContentTypeLabel(linkMeta?.contentType);
            const firstLine = row.content.split(/\r?\n/)[0]?.trim() || "Untitled";
            const displayTitle = row.title?.trim() || linkMeta?.title || firstLine;
            const preview =
              row.kind === "link"
                ? linkMeta?.description || href || ""
                : row.content.replace(/\s+/g, " ").trim();
            const isExpanded = expandedId === row.id;
            const canInlineEdit =
              row.kind === "quote" || row.kind === "checklist" || row.kind === "meeting";

            return (
              <div
                key={row.id}
                className="rounded-xl border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {row.isPinned && (
                          <Pin className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Pinned" />
                        )}
                        {row.kind === "link" && href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-w-0 items-center gap-1 text-sm font-medium text-foreground hover:underline"
                          >
                            <span className="truncate">{displayTitle}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                          </a>
                        ) : canInlineEdit ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : row.id)}
                            className="text-left text-sm font-medium text-foreground hover:underline truncate max-w-full"
                          >
                            {displayTitle}
                          </button>
                        ) : (
                          <Link
                            href={`/notes/${row.id}`}
                            className="block truncate text-sm font-medium text-foreground hover:underline"
                          >
                            {displayTitle}
                          </Link>
                        )}
                      </div>

                      {preview && (
                        <p className="truncate text-xs text-muted-foreground">{preview}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                        {host && <span className="font-medium text-foreground/80">{host}</span>}
                        {contentTypeLabel && (
                          <span className="rounded bg-muted px-1.5 py-0.5">{contentTypeLabel}</span>
                        )}
                        <span>{formatRelativeTime(row.createdAt)}</span>
                        {row.tags.map((tag) => (
                          <span key={tag} className="rounded bg-muted px-1.5 py-0.5">
                            #{tag}
                          </span>
                        ))}
                      </div>

                      {linkMeta &&
                        "summary" in linkMeta &&
                        Array.isArray((linkMeta as { summary?: { bullets?: string[] } }).summary?.bullets) && (
                          <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-xs text-muted-foreground">
                            {(linkMeta as { summary: { bullets: string[] } }).summary.bullets.map(
                              (b, bi) => (
                                <li key={bi}>{b}</li>
                              )
                            )}
                          </ul>
                        )}
                    </div>

                    {(linkMeta?.thumbnail || row.thumbnailUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={(linkMeta?.thumbnail || row.thumbnailUrl) as string}
                        alt=""
                        className="h-12 w-16 shrink-0 rounded-md object-cover border border-border"
                      />
                    )}
                  </div>

                  {/* Row Actions */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Note actions"
                      onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {openMenuId === row.id && (
                      <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-border bg-card p-1.5 shadow-lg space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            void handlePin(row.id);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                        >
                          <Pin className="h-4 w-4" aria-hidden="true" />
                          {row.isPinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            void handleArchive(row.id);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                        >
                          <Archive className="h-4 w-4" aria-hidden="true" />
                          {row.archivedAt ? "Unarchive" : "Archive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            void handleCopy(row);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            void handleShare(row);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                        >
                          <Share2 className="h-4 w-4" aria-hidden="true" />
                          Share
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setTaggingId(row.id);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                        >
                          <Tag className="h-4 w-4" aria-hidden="true" />
                          Add tag
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            void handleConvertToTask(row.id);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                        >
                          <CheckSquare className="h-4 w-4" aria-hidden="true" />
                          Convert to task
                        </button>
                        {row.kind === "link" && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              void summarizeLinkNoteAction(row.id).then((res) => {
                                if (!res.ok) {
                                  toast.error(res.error);
                                } else {
                                  toast.success("Summary saved");
                                  void refreshInbox();
                                }
                              });
                            }}
                            className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                          >
                            Summarize
                          </button>
                        )}
                        <Link
                          href={`/notes/${row.id}`}
                          onClick={() => setOpenMenuId(null)}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                        >
                          Open full editor
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setConfirmDeleteId(row.id);
                          }}
                          className="flex w-full min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-destructive hover:bg-muted"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline tag input */}
                {taggingId === row.id && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddTag(row.id);
                        }
                      }}
                      placeholder="Tag name..."
                      className="flex-1 min-h-[44px] rounded-md border border-input bg-background px-2.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddTag(row.id)}
                      className="min-h-[44px] rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaggingId(null);
                        setTagInput("");
                      }}
                      className="min-h-[44px] rounded-md border border-border px-3 text-xs text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Delete confirmation */}
                {confirmDeleteId === row.id && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
                    <span className="text-xs font-medium text-destructive">Delete this note?</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[44px] rounded-md border border-border bg-background px-3 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row.id)}
                        className="min-h-[44px] rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline editors for Quote, Steps, and Meeting */}
                {isExpanded && row.kind === "quote" && (
                  <div className="border-t border-border pt-3">
                    <QuoteEditor
                      noteId={row.id}
                      initialMeta={
                        (row.meta as QuoteMeta | null) ?? { text: row.content, source: null }
                      }
                      onUpdated={() => void refreshInbox()}
                    />
                  </div>
                )}

                {isExpanded && row.kind === "checklist" && (
                  <div className="border-t border-border pt-3">
                    <StepsChecklistEditor
                      noteId={row.id}
                      initialItems={((row.meta as ChecklistMeta | null)?.items) ?? []}
                      onUpdated={() => void refreshInbox()}
                    />
                  </div>
                )}

                {isExpanded && row.kind === "meeting" && (
                  <div className="border-t border-border pt-3">
                    <MeetingMinutesEditor
                      noteId={row.id}
                      initialTitle={row.title ?? ""}
                      initialContent={row.content}
                      initialMeta={
                        (row.meta as MeetingMeta | null) ?? {
                          date: new Date(row.createdAt).toISOString().slice(0, 10),
                          attendees: "",
                          agenda: "",
                          decisions: "",
                          actionItems: [],
                          nextMeeting: null,
                        }
                      }
                      onUpdated={() => void refreshInbox()}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CaptureSheet
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCaptured={() => void refreshInbox()}
      />

      <VaultImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
