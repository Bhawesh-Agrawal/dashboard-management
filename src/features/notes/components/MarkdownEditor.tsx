"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  id?: string;
  fillHeight?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your note in Markdown…",
  minHeight = "200px",
  id,
  fillHeight = false,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<"write" | "preview" | "split">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

      // Reset focus & selection
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

  return (
    <div className={cn(
      "flex flex-col overflow-hidden bg-background",
      fillHeight ? "h-full" : "border border-border rounded-lg focus-within:ring-1 focus-within:ring-ring transition-shadow"
    )}>
      {/* Editor Header / Toolbar */}
      <div className={cn(
        "flex flex-wrap items-center justify-between gap-1 px-2 py-1.5 text-muted-foreground shrink-0",
        fillHeight ? "border-b border-border/50" : "bg-muted/40 border-b border-border"
      )}>
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
        </div>

        {/* View Mode Toggle (Write / Preview / Split) */}
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

      {/* Editor Content Body */}
      <div className={cn(
        "grid flex-1 min-h-0 overflow-hidden",
        mode === "split" ? "grid-cols-2 divide-x divide-border" : "grid-cols-1"
      )}>
        {/* Write Mode / Left Split */}
        {(mode === "write" || mode === "split") && (
          <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
              <ReactMarkdown>{value}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground italic text-xs">Nothing to preview yet…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
