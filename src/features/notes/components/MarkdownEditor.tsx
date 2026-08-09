"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import Link from "next/link";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Minus,
  Link as LinkIcon,
  Eye,
  Edit3,
  Columns,
  Link2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WikilinkAutocomplete } from "./WikilinkAutocomplete";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  id?: string;
  fillHeight?: boolean;
  noteId?: string;
}

function parseWikilinks(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, title) => `[${title}](/notes/search?q=${encodeURIComponent(title)})`);
}

const markdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    if (href?.startsWith("/notes/")) {
      return (
        <Link
          href={href}
          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          {...props}
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
        {...props}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your note in Markdown…",
  minHeight = "200px",
  id,
  fillHeight = false,
  noteId,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<"write" | "preview" | "split">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [wikilinkOpen, setWikilinkOpen] = useState(false);
  const [wikilinkQuery, setWikilinkQuery] = useState("");
  const [backlinksOpen, setBacklinksOpen] = useState(false);

  const insertText = useCallback(
    (prefix: string, suffix: string = "", defaultText: string = "") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end) || defaultText;
      const replacement = `${prefix}${selectedText}${suffix}`;

      const newValue =
        value.substring(0, start) + replacement + value.substring(end);
      onChange(newValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + selectedText.length
        );
      }, 0);
    },
    [value, onChange]
  );

  const insertPrefixToLine = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const newValue =
        value.substring(0, lineStart) + prefix + value.substring(lineStart);

      onChange(newValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }, 0);
    },
    [value, onChange]
  );

  const insertWikilink = useCallback(
    (title: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Find the [[ that triggered this
      const beforeCursor = value.substring(0, start);
      const linkStart = beforeCursor.lastIndexOf("[[");

      if (linkStart === -1) {
        // Fallback: just insert at cursor
        const linkText = `[[${title}]]`;
        const newValue = value.substring(0, start) + linkText + value.substring(end);
        onChange(newValue);
      } else {
        // Replace from [[ to cursor with the selected title
        const newValue =
          value.substring(0, linkStart) + `[[${title}]]` + value.substring(end);
        onChange(newValue);
      }

      setWikilinkOpen(false);
      setWikilinkQuery("");

      setTimeout(() => {
        textarea.focus();
      }, 0);
    },
    [value, onChange]
  );

  // Detect [[ trigger
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      const newValue = target.value;
      onChange(newValue);

      const cursorPos = target.selectionStart;
      const beforeCursor = newValue.substring(0, cursorPos);
      const lastOpenBracket = beforeCursor.lastIndexOf("[[");

      if (lastOpenBracket !== -1) {
        const afterBracket = beforeCursor.substring(lastOpenBracket + 2);
        // Only trigger if there's no closing ]] between [[ and cursor
        if (!afterBracket.includes("]]")) {
          setWikilinkQuery(afterBracket);
          setWikilinkOpen(true);
          return;
        }
      }
      setWikilinkOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (wikilinkOpen) {
        // Let WikilinkAutocomplete handle its own keys
        return;
      }

      // Keyboard shortcuts
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "b":
            e.preventDefault();
            insertText("**", "**", "bold text");
            break;
          case "i":
            e.preventDefault();
            insertText("*", "*", "italic text");
            break;
          case "k":
            e.preventDefault();
            insertText("[", "](https://)", "link title");
            break;
        }
      }
    },
    [wikilinkOpen, insertText]
  );

  // Render wikilinks in preview
  const renderedContent = parseWikilinks(value);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background",
        fillHeight
          ? "h-full"
          : "border border-border rounded-lg focus-within:ring-1 focus-within:ring-ring transition-shadow"
      )}
    >
      {/* Wikilink Autocomplete */}
      <WikilinkAutocomplete
        open={wikilinkOpen}
        query={wikilinkQuery}
        onSelect={(note) => insertWikilink(note.title)}
        onClose={() => {
          setWikilinkOpen(false);
          setWikilinkQuery("");
          textareaRef.current?.focus();
        }}
      />

      {/* Editor Header / Toolbar */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-1 px-2 py-1.5 text-muted-foreground shrink-0",
          fillHeight
            ? "border-b border-border/50"
            : "bg-muted/40 border-b border-border"
        )}
      >
        {/* Quick Format Tools */}
        <div className="flex items-center gap-0.5 overflow-x-auto py-0.5 max-w-full">
          <button
            type="button"
            title="Bold (**text**)"
            onClick={() => insertText("**", "**", "bold text")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Italic (*text*)"
            onClick={() => insertText("*", "*", "italic text")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Italic className="h-4 w-4" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            type="button"
            title="Heading 1"
            onClick={() => insertPrefixToLine("# ")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Heading1 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Heading 2"
            onClick={() => insertPrefixToLine("## ")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Heading2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Heading 3"
            onClick={() => insertPrefixToLine("### ")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Heading3 className="h-4 w-4" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            type="button"
            title="Bullet List (- item)"
            onClick={() => insertPrefixToLine("- ")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Numbered List (1. item)"
            onClick={() => insertPrefixToLine("1. ")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Task Checkbox (- [ ] task)"
            onClick={() => insertPrefixToLine("- [ ] ")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <CheckSquare className="h-4 w-4" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            type="button"
            title="Code Block"
            onClick={() => insertText("```\n", "\n```", "code here")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Code className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Quote (> quote)"
            onClick={() => insertPrefixToLine("> ")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Quote className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Horizontal Divider"
            onClick={() => insertText("\n---\n", "", "")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Link ([Title](url))"
            onClick={() => insertText("[", "](https://)", "link title")}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <LinkIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Wikilink ([[Note Title]])"
            onClick={() => {
              insertText("[[", "]]", "");
              setWikilinkQuery("");
              setWikilinkOpen(true);
            }}
            className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>

        {/* View Mode Toggle + Backlinks */}
        <div className="flex items-center gap-1">
          {/* Backlinks toggle (only when noteId provided) */}
          {noteId && (
            <button
              type="button"
              onClick={() => setBacklinksOpen(!backlinksOpen)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded font-medium transition-colors",
                backlinksOpen
                  ? "bg-accent text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Toggle backlinks panel"
            >
              {backlinksOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <Link2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Backlinks</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-background p-0.5 rounded-md border border-border">
            <button
              type="button"
              onClick={() => setMode("write")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded font-medium transition-colors",
                mode === "write"
                  ? "bg-accent text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Write</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("split")}
              className={cn(
                "hidden md:flex items-center gap-1 px-2 py-1 text-xs rounded font-medium transition-colors",
                mode === "split"
                  ? "bg-accent text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Columns className="h-3.5 w-3.5" />
              <span>Split</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded font-medium transition-colors",
                mode === "preview"
                  ? "bg-accent text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor Content Body */}
      <div
        className={cn(
          "grid flex-1 min-h-0 overflow-hidden",
          mode === "split"
            ? "grid-cols-2 divide-x divide-border"
            : "grid-cols-1",
          backlinksOpen && noteId && "lg:grid-cols-[1fr_240px]"
        )}
      >
        {/* Write Mode / Left Split */}
        {(mode === "write" || mode === "split") && (
          <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={fillHeight ? undefined : { minHeight }}
            className={cn(
              "w-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none leading-relaxed",
              fillHeight && "h-full"
            )}
          />
        )}

        {/* Preview Mode / Right Split */}
        {(mode === "preview" || mode === "split") && (
          <div
            style={fillHeight ? undefined : { minHeight }}
            className={cn(
              "p-4 overflow-y-auto prose prose-sm max-w-none dark:prose-invert prose-headings:font-serif prose-headings:font-semibold prose-a:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-md",
              fillHeight && "h-full"
            )}
          >
            {value.trim() ? (
              <ReactMarkdown components={markdownComponents}>
                {renderedContent}
              </ReactMarkdown>
            ) : (
              <p className="text-muted-foreground italic text-xs">
                Nothing to preview yet…
              </p>
            )}
          </div>
        )}

        {/* Backlinks Sidebar */}
        {backlinksOpen && noteId && (
          <div className="hidden lg:block border-l border-border overflow-y-auto p-3">
            <BacklinksPanelInline noteId={noteId} />
          </div>
        )}
      </div>
    </div>
  );
}

function BacklinksPanelInline({
  noteId,
}: {
  noteId: string;
}) {
  const [backlinks, setBacklinks] = useState<
    Array<{ id: string; contextSnippet: string; score: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBacklinks() {
      try {
        const response = await fetch(`/api/notes/${noteId}/backlinks`);
        if (response.ok) {
          const data = await response.json();
          setBacklinks(data.notes || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchBacklinks();
  }, [noteId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Backlinks
        </p>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (backlinks.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Backlinks ({backlinks.length})
      </p>
      <div className="space-y-2">
        {backlinks.map((note) => (
          <Link
            key={note.id}
            href={`/notes/${note.id}`}
            className="block p-2 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors"
          >
            <p className="text-xs line-clamp-2 text-foreground">
              {note.contextSnippet}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
