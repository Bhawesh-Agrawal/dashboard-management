"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  FileText,
  Star,
  Clock,
  Link as LinkIcon,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Pin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextMenu } from "@/components/ui/context-menu";
import {
  getDocumentFolders,
  createDocumentFolder,
  updateDocumentFolder,
  deleteDocumentFolder,
  pinDocumentFolder,
} from "@/features/notes/lib/actions-documents";
import type { DocumentFolderWithCount } from "@/types";

type QuickFilter = "all" | "favorites" | "recent" | "links";

export interface NotesSidebarProps {
  activeTab: string;
  activeFolderId?: string;
  onFolderSelect: (folderId: string | null) => void;
  onQuickFilterSelect: (filter: QuickFilter) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  activeQuickFilter?: QuickFilter;
}

export function NotesSidebar({
  activeTab,
  activeFolderId,
  onFolderSelect,
  onQuickFilterSelect,
  onSearch,
  searchQuery,
  activeQuickFilter = "all",
}: NotesSidebarProps) {
  const [folders, setFolders] = useState<DocumentFolderWithCount[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [subfolders, setSubfolders] = useState<Map<string, DocumentFolderWithCount[]>>(new Map());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");

  const loadRootFolders = useCallback(async () => {
    const result = await getDocumentFolders(undefined);
    setFolders(result);
  }, []);

  useEffect(() => {
    if (activeTab === "documents") {
      loadRootFolders();
    }
  }, [activeTab, loadRootFolders]);

  const toggleFolderExpand = useCallback(async (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });

    // Load subfolders if not cached
    if (!subfolders.has(folderId)) {
      const result = await getDocumentFolders(folderId);
      setSubfolders((prev) => new Map(prev).set(folderId, result));
    }
  }, [subfolders]);

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;

    const result = await createDocumentFolder({
      name: newFolderName.trim(),
      parentId: activeFolderId || undefined,
    });

    if (result.ok) {
      setNewFolderName("");
      setCreatingFolder(false);
      await loadRootFolders();
      // Also reload subfolders if we're inside a folder
      if (activeFolderId) {
        const sub = await getDocumentFolders(activeFolderId);
        setSubfolders((prev) => new Map(prev).set(activeFolderId, sub));
      }
    }
  }

  async function handleRenameFolder(folderId: string) {
    if (!editFolderName.trim()) return;

    await updateDocumentFolder(folderId, { name: editFolderName.trim() });
    setEditingFolder(null);
    setEditFolderName("");
    await loadRootFolders();
    if (activeFolderId) {
        const sub = await getDocumentFolders(activeFolderId);
      setSubfolders((prev) => new Map(prev).set(activeFolderId, sub));
    }
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm("Delete this folder? Notes will be moved to root.")) return;
    await deleteDocumentFolder(folderId);
    if (activeFolderId === folderId) {
      onFolderSelect(null);
    }
    await loadRootFolders();
  }

  async function handlePinFolder(folderId: string) {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    await pinDocumentFolder(folderId, !folder.isPinned);
    await loadRootFolders();
  }

  function getFolderContextMenu(folder: DocumentFolderWithCount) {
    return [
      {
        label: "Rename",
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => {
          setEditingFolder(folder.id);
          setEditFolderName(folder.name);
        },
      },
      {
        label: folder.isPinned ? "Unpin" : "Pin to top",
        icon: <Pin className="h-4 w-4" />,
        onClick: () => handlePinFolder(folder.id),
      },
      {
        label: "Delete",
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => handleDeleteFolder(folder.id),
        destructive: true,
      },
    ];
  }

  function renderFolder(folder: DocumentFolderWithCount, depth: number = 0) {
    const isExpanded = expandedFolders.has(folder.id);
    const isActive = activeFolderId === folder.id;
    const children = subfolders.get(folder.id) || [];

    return (
      <div key={folder.id}>
        <ContextMenu items={getFolderContextMenu(folder)}>
          <div
            className={cn(
              "flex items-center gap-1.5 py-1 px-2 rounded-md text-sm cursor-pointer transition-colors group",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
            style={{ paddingLeft: `${(depth * 12) + 8}px` }}
            onClick={() => onFolderSelect(folder.id)}
          >
            {/* Expand chevron */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolderExpand(folder.id);
              }}
              className="shrink-0 p-0.5 rounded hover:bg-muted/50"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>

            {/* Folder icon */}
            <div
              className="h-5 w-5 rounded flex items-center justify-center shrink-0"
              style={{ backgroundColor: folder.color || "#E5E2DD" }}
            >
              <FolderOpen className="h-3 w-3 text-white" />
            </div>

            {/* Name or edit input */}
            {editingFolder === folder.id ? (
              <input
                type="text"
                value={editFolderName}
                onChange={(e) => setEditFolderName(e.target.value)}
                onBlur={() => handleRenameFolder(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameFolder(folder.id);
                  if (e.key === "Escape") {
                    setEditingFolder(null);
                    setEditFolderName("");
                  }
                }}
                autoFocus
                className="flex-1 h-5 text-xs rounded border border-input bg-background px-1"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 truncate">{folder.name}</span>
            )}

            {/* Count */}
            <span className="text-xs text-muted-foreground shrink-0">
              {folder._count.notes}
            </span>
          </div>
        </ContextMenu>

        {/* Subfolders */}
        {isExpanded && children.length > 0 && (
          <div>
            {children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  if (activeTab !== "documents") {
    return (
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search notes..."
            className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm"
          />
        </div>

        {/* Quick filters */}
        <div className="space-y-0.5">
          <QuickFilterButton
            icon={<FileText className="h-3.5 w-3.5" />}
            label="All Notes"
            active={activeQuickFilter === "all"}
            onClick={() => onQuickFilterSelect("all")}
          />
          <QuickFilterButton
            icon={<Star className="h-3.5 w-3.5" />}
            label="Favorites"
            active={activeQuickFilter === "favorites"}
            onClick={() => onQuickFilterSelect("favorites")}
          />
          <QuickFilterButton
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Recent"
            active={activeQuickFilter === "recent"}
            onClick={() => onQuickFilterSelect("recent")}
          />
          <QuickFilterButton
            icon={<LinkIcon className="h-3.5 w-3.5" />}
            label="Links"
            active={activeQuickFilter === "links"}
            onClick={() => onQuickFilterSelect("links")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search documents..."
          className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm"
        />
      </div>

      {/* Quick filters */}
      <div className="space-y-0.5">
        <QuickFilterButton
          icon={<FileText className="h-3.5 w-3.5" />}
          label="All Notes"
          active={activeQuickFilter === "all"}
          onClick={() => {
            onQuickFilterSelect("all");
            onFolderSelect(null);
          }}
        />
        <QuickFilterButton
          icon={<Star className="h-3.5 w-3.5" />}
          label="Favorites"
          active={activeQuickFilter === "favorites"}
          onClick={() => {
            onQuickFilterSelect("favorites");
            onFolderSelect(null);
          }}
        />
        <QuickFilterButton
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Recent"
          active={activeQuickFilter === "recent"}
          onClick={() => {
            onQuickFilterSelect("recent");
            onFolderSelect(null);
          }}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-sidebar-border" />

      {/* Folders header */}
      <div className="flex items-center justify-between">
        <span className="section-label">Folders</span>
        <button
          type="button"
          onClick={() => setCreatingFolder(true)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          title="New folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Folder tree */}
      <div className="space-y-0.5">
        {folders.map((folder) => renderFolder(folder))}

        {/* New folder input */}
        {creatingFolder && (
          <div className="flex items-center gap-1.5 py-1 px-2">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={() => {
                if (newFolderName.trim()) {
                  handleCreateFolder();
                } else {
                  setCreatingFolder(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }
              }}
              autoFocus
              placeholder="Folder name"
              className="flex-1 h-6 text-xs rounded border border-input bg-background px-2"
            />
          </div>
        )}

        {folders.length === 0 && !creatingFolder && (
          <p className="text-xs text-muted-foreground py-2 px-2">
            No folders yet
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-sidebar-border" />

      {/* Tags section */}
      <div>
        <span className="section-label">Tags</span>
        <p className="text-xs text-muted-foreground py-2 px-2">
          Tags appear on your notes
        </p>
      </div>
    </div>
  );
}

// ─── Quick Filter Button ──────────────────────────────────────

function QuickFilterButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-2 sm:py-1.5 rounded-md text-sm transition-colors text-left min-h-[44px] sm:min-h-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}
