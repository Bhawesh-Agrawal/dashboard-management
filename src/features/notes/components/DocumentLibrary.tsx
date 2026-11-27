"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from "react";
import {
  Upload,
  FolderOpen,
  LayoutGrid,
  List,
  ChevronRight,
  FileText,
  Image,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentCard } from "./DocumentCard";
import { DocumentUploadDialog } from "./DocumentUploadDialog";
import { FileViewerModal } from "./FileViewerModal";
import dynamic from "next/dynamic";

const PdfViewerModal = dynamic(
  () => import("./PdfViewerModal").then((m) => m.PdfViewerModal),
  { ssr: false }
);
import {
  getDocumentNotes,
  getDocumentFolders,
  getFolderBreadcrumb,
  favoriteDocumentNote,
  deleteDocumentNote,
} from "@/features/notes/lib/actions-documents";
import { getFileAttachments } from "@/features/files/lib/actions";
import { getAnnotations } from "@/features/notes/lib/actions-annotations";
import type { NoteWithDocumentInfo, DocumentFolderWithCount } from "@/types";
import type { AttachmentType, NoteAnnotation } from "@prisma/client";
import type { FileAttachment } from "@/features/files/lib/actions";
import { toast } from "sonner";

type ViewMode = "grid" | "list";
type SortBy = "createdAt" | "title" | "fileSize" | "lastViewedAt";

const TYPE_FILTERS: { value: AttachmentType | null; label: string; icon: typeof FileText | null }[] = [
  { value: null, label: "All", icon: null },
  { value: "PDF", label: "PDF", icon: FileText },
  { value: "IMAGE", label: "Images", icon: Image },
  { value: "VIDEO", label: "Videos", icon: Video },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "createdAt", label: "Date added" },
  { value: "title", label: "Name" },
  { value: "fileSize", label: "Size" },
  { value: "lastViewedAt", label: "Last viewed" },
];

function deriveDocumentType(contentType: string): AttachmentType {
  const ct = contentType.toLowerCase();
  if (ct.includes("pdf")) return "PDF";
  if (ct.includes("image/")) return "IMAGE";
  if (ct.includes("video/")) return "VIDEO";
  if (ct.includes("audio/")) return "AUDIO";
  if (ct.includes("text/")) return "TEXT";
  if (ct.includes("word") || ct.includes("document")) return "DOCUMENT";
  return "OTHER";
}

function mapFileAttachmentToNote(file: FileAttachment): NoteWithDocumentInfo {
  return {
    id: file.id,
    userId: null,
    title: file.description || file.fileName,
    content: file.description || "",
    sourceType: "typed",
    sourceLink: null,
    tags: file.tags,
    courseId: file.courseId,
    isDocumentLibraryEntry: false,
    folderId: null,
    taskId: null,
    projectId: null,
    documentType: deriveDocumentType(file.contentType),
    s3Key: file.key,
    s3Url: file.url,
    fileSize: file.fileSize,
    fileName: file.fileName,
    mimeType: file.contentType,
    pageCount: null,
    thumbnailUrl: null,
    originalUrl: null,
    embedHtml: null,
    extractedText: null,
    lastViewedAt: null,
    viewCount: 0,
    isPinned: false,
    isFavorite: false,
    lastReviewedAt: null,
    reviewCount: 0,
    createdAt: file.uploadedAt,
    updatedAt: file.uploadedAt,
    course: null,
    task: null,
    project: null,
    folder: file.category ? { id: "", name: file.category, type: "GENERAL", color: null } : null,
    noteAttachments: [],
    _count: { noteAttachments: 0, annotations: 0 },
    // Mark as file attachment for source badge
    _source: "file_attachment" as const,
  } as NoteWithDocumentInfo & { _source?: string };
}

export interface DocumentLibraryProps {
  folderId?: string;
  onFolderSelect: (folderId: string | null) => void;
  searchQuery: string;
}

export function DocumentLibrary({
  folderId,
  onFolderSelect,
  searchQuery,
}: DocumentLibraryProps) {
  const [documents, setDocuments] = useState<NoteWithDocumentInfo[]>([]);
  const [folders, setFolders] = useState<DocumentFolderWithCount[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [typeFilter, setTypeFilter] = useState<AttachmentType | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<NoteWithDocumentInfo | null>(null);
  const [pdfAnnotations, setPdfAnnotations] = useState<NoteAnnotation[]>([]);
  const [storageOffline, setStorageOffline] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/health/storage", { credentials: "include" })
      .then((res) => {
        if (!active) return;
        setStorageOffline(!res.ok);
      })
      .catch(() => {
        if (active) setStorageOffline(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [notesResult, foldersResult, breadcrumbResult, filesResult] = await Promise.all([
      getDocumentNotes({
        folderId: folderId || undefined,
        type: typeFilter || undefined,
        sortBy,
        sortOrder: "desc",
        searchQuery: searchQuery || undefined,
      }),
      getDocumentFolders(folderId || undefined),
      folderId ? getFolderBreadcrumb(folderId) : Promise.resolve({ ok: true, data: [] }),
      getFileAttachments({
        // When a folder is selected, only show file attachments when at root (no folder filter for file attachments since they don't use folders)
        ...(folderId ? { courseId: undefined } : {}),
      }),
    ]);

    const noteDocs = notesResult.ok ? notesResult.data.notes : [];
    const fileDocs = filesResult.ok ? filesResult.data.map(mapFileAttachmentToNote) : [];

    // Merge and sort
    const allDocs = [...noteDocs, ...fileDocs];
    allDocs.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Apply type filter to merged results
    const filteredDocs = typeFilter
      ? allDocs.filter((d) => d.documentType === typeFilter)
      : allDocs;

    // Apply search filter
    const searchFilteredDocs = searchQuery
      ? filteredDocs.filter(
          (d) =>
            (d.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            d.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            d.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : filteredDocs;

    setDocuments(searchFilteredDocs);
    setFolders(foldersResult);
    setBreadcrumb(breadcrumbResult.ok ? breadcrumbResult.data : []);
    setLoading(false);
  }, [folderId, sortBy, typeFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleFavorite(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    await favoriteDocumentNote(id, !doc.isFavorite);
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, isFavorite: !d.isFavorite } : d
      )
    );
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document?")) return;
    const result = await deleteDocumentNote(id);
    if (result.ok) {
      toast.success("Document deleted");
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } else {
      toast.error(result.error);
    }
  }

  async function handleView(note: NoteWithDocumentInfo) {
    if (!note.s3Url) return;
    setSelectedNote(note);
    if (note.documentType === "PDF") {
      // Fetch annotations for this note if it's a PDF
      const annotationsResult = await getAnnotations(note.id);
      setPdfAnnotations(annotationsResult);
    }
    setViewerOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => onFolderSelect(null)}
            className="hover:text-foreground transition-colors"
          >
            Home
          </button>
          {breadcrumb.map((item) => (
            <span key={item.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button
                type="button"
                onClick={() => onFolderSelect(item.id)}
                className="hover:text-foreground transition-colors"
              >
                {item.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {/* Toolbar */}
      {storageOffline && (
        <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-destructive">
          Files are unavailable: storage offline
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Type filter */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value ?? "all"}
              type="button"
              onClick={() => setTypeFilter(filter.value)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-2 sm:py-1 text-xs rounded-full transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 shrink-0",
                typeFilter === filter.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.icon && <filter.icon className="h-3 w-3" />}
              {filter.label}
            </button>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="h-10 sm:h-8 text-xs rounded-md border border-input bg-background px-2 text-muted-foreground min-h-[44px] sm:min-h-0"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 sm:p-1 rounded transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center",
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 sm:p-1 rounded transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Upload */}
          <button
            type="button"
            onClick={() => setUploadDialogOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors min-h-[44px] sm:min-h-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </button>
        </div>
      </div>

      {/* Subfolders */}
      {folders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => onFolderSelect(folder.id)}
              className="flex items-center gap-2 p-2.5 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors text-left"
            >
              <div
                className="h-8 w-8 rounded flex items-center justify-center shrink-0"
                style={{ backgroundColor: folder.color || "#E5E2DD" }}
              >
                <FolderOpen className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{folder.name}</p>
                <p className="text-xs text-muted-foreground">
                  {folder._count.notes} item{folder._count.notes !== 1 ? "s" : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Documents */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <FolderOpen className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm">No documents in this folder</p>
          <button
            type="button"
            onClick={() => setUploadDialogOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload your first document
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              note={doc}
              viewMode="grid"
              onFavorite={handleFavorite}
              onDelete={handleDelete}
              onView={handleView}
            />
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              note={doc}
              viewMode="list"
              onFavorite={handleFavorite}
              onDelete={handleDelete}
              onView={handleView}
            />
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <DocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        folderId={folderId}
        folderName={breadcrumb[breadcrumb.length - 1]?.name}
        onUploadComplete={loadData}
      />
      
      <FileViewerModal
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        note={selectedNote}
        annotations={pdfAnnotations}
      />
    </div>
  );
}
