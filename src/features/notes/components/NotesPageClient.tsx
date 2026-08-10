"use client";

import { useState, useCallback } from "react";
import { Menu, X, Upload } from "lucide-react";
import { NoteTabs, type TabValue } from "./NoteTabs";
import { NotesSidebar } from "./NotesSidebar";
import { NoteList } from "./note-list";
import { DocumentLibrary } from "./DocumentLibrary";
import { LinkList } from "./LinkList";
import { QuickCapture } from "./quick-capture";
import { VaultImportDialog } from "./VaultImportDialog";
import { DailyNoteButton } from "./DailyNoteButton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useNotes } from "@/lib/sync/hooks";
import type { SyncNote } from "@/lib/sync/db";

type QuickFilter = "all" | "favorites" | "recent" | "links";

export function NotesPageClient() {
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>("all");
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const initialNotes = useNotes();
  const noteCount = initialNotes.length;

  // Compute counts
  const counts = {
    all: noteCount,
    documents: initialNotes.filter((n) => n.isDocumentLibraryEntry).length,
    links: initialNotes.filter((n) => n.sourceLink).length,
    favorites: initialNotes.filter((n) => n.isFavorite).length,
  };

  // Filter notes based on active tab and quick filter
  const filteredNotes = initialNotes.filter((note) => {
    // Skip document library entries from regular note lists
    if (note.isDocumentLibraryEntry && activeTab !== "documents") return false;

    switch (activeTab) {
      case "all":
        if (activeQuickFilter === "favorites") return note.isFavorite;
        if (activeQuickFilter === "recent") {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return new Date(note.createdAt) > weekAgo;
        }
        if (activeQuickFilter === "links") {
          return !!note.sourceLink;
        }
        return true;
      case "favorites":
        return note.isFavorite;
      case "links":
        return !!note.sourceLink;
      default:
        return true;
    }
  });

  // Search filter
  const searchFilteredNotes = searchQuery
    ? filteredNotes.filter(
        (n) =>
          n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : filteredNotes;

  const linkNotes = initialNotes.filter(
    (n) => !n.isDocumentLibraryEntry && !!n.sourceLink
  );

  const handleTabChange = useCallback((tab: TabValue) => {
    setActiveTab(tab);
    setSearchQuery("");
    if (tab !== "documents") {
      setActiveFolderId(undefined);
    }
    if (tab === "all") {
      setActiveQuickFilter("all");
    }
  }, []);

  const handleQuickFilterSelect = useCallback((filter: QuickFilter) => {
    setActiveQuickFilter(filter);
    setSearchQuery("");
  }, []);

  const handleFolderSelect = useCallback((folderId: string | null) => {
    setActiveFolderId(folderId || undefined);
    if (folderId) {
      setActiveTab("documents");
    }
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="page-heading">Notes</h1>
            <span className="text-sm text-muted-foreground mt-1">
              {noteCount} note{noteCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="mt-3">
            <NoteTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
              counts={counts}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <DailyNoteButton variant="header" />
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
            title="Import vault"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <QuickCapture />
          {/* Mobile sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2.5 rounded-md border border-border hover:bg-accent transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-6 mt-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-6">
            <NotesSidebar
              activeTab={activeTab}
              activeFolderId={activeFolderId}
              onFolderSelect={handleFolderSelect}
              onQuickFilterSelect={handleQuickFilterSelect}
              onSearch={setSearchQuery}
              searchQuery={searchQuery}
              activeQuickFilter={activeQuickFilter}
            />
          </div>
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-4" showCloseButton={false}>
            <div className="flex items-center justify-between mb-4">
              <SheetTitle className="font-serif">Navigate</SheetTitle>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NotesSidebar
              activeTab={activeTab}
              activeFolderId={activeFolderId}
              onFolderSelect={(id) => {
                handleFolderSelect(id);
                setSidebarOpen(false);
              }}
              onQuickFilterSelect={(filter) => {
                handleQuickFilterSelect(filter);
                setSidebarOpen(false);
              }}
              onSearch={setSearchQuery}
              searchQuery={searchQuery}
              activeQuickFilter={activeQuickFilter}
            />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {activeTab === "all" || activeTab === "favorites" ? (
            searchFilteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                <p className="text-sm">
                  {searchQuery
                    ? "No notes match your search"
                    : activeTab === "favorites"
                      ? "No favorite notes yet"
                      : "No notes yet"}
                </p>
                {!searchQuery && <QuickCapture />}
              </div>
            ) : (
              <NoteList notes={searchFilteredNotes as any} />
            )
          ) : activeTab === "documents" ? (
            <DocumentLibrary
              folderId={activeFolderId}
              onFolderSelect={handleFolderSelect}
              searchQuery={searchQuery}
            />
          ) : activeTab === "links" ? (
            <LinkList links={linkNotes as any} />
          ) : null}
        </main>
      </div>

      {/* Vault Import Dialog */}
      <VaultImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
