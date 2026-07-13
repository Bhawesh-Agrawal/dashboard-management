"use client";

import { useEffect, useRef, useCallback } from "react";
import { Highlighter, Underline, StickyNote, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TextSelectionFloatingBarProps {
  visible: boolean;
  position: { x: number; y: number };
  selectedText: string;
  activeColor: string;
  onHighlight: () => void;
  onUnderline: () => void;
  onAddNote: () => void;
  onCopy: () => void;
  onClose: () => void;
  inline?: boolean;
}

export function TextSelectionFloatingBar({
  visible,
  position,
  selectedText,
  activeColor,
  onHighlight,
  onUnderline,
  onAddNote,
  onCopy,
  onClose,
  inline = false,
}: TextSelectionFloatingBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!visible) return;
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, handleClickOutside, handleKeyDown]);

  if (!visible || !selectedText) return null;

  const buttons = [
    {
      icon: <Highlighter className="h-3.5 w-3.5" />,
      label: "Highlight",
      onClick: onHighlight,
      style: { color: activeColor },
    },
    {
      icon: <Underline className="h-3.5 w-3.5" />,
      label: "Underline",
      onClick: onUnderline,
      style: { textDecoration: "underline", textDecorationColor: "#A855F7" },
    },
    {
      icon: <StickyNote className="h-3.5 w-3.5" />,
      label: "Add Note",
      onClick: onAddNote,
      style: {},
    },
    {
      icon: <Copy className="h-3.5 w-3.5" />,
      label: "Copy",
      onClick: onCopy,
      style: {},
    },
  ];

  return (
    <div
      ref={barRef}
      data-selection-bar
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "flex items-center gap-0.5 p-1 pointer-events-auto",
        "bg-popover border border-border rounded-lg shadow-lg",
        "animate-in fade-in-0 zoom-in-95",
        !inline && "fixed z-50"
      )}
      style={!inline ? {
        left: `${position.x}px`,
        top: `${position.y - 48}px`,
        transform: "translateX(-50%)",
      } : undefined}
    >
      {buttons.map((btn) => (
        <button
          key={btn.label}
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.onClick();
          }}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium",
            "text-foreground hover:bg-accent transition-colors",
            "min-h-[28px]"
          )}
          title={btn.label}
          style={btn.style}
        >
          {btn.icon}
          <span className="hidden sm:inline">{btn.label}</span>
        </button>
      ))}
      <div className="w-px h-4 bg-border mx-0.5" />
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "flex items-center justify-center p-1 rounded-md",
          "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
          "min-h-[28px] min-w-[28px]"
        )}
        title="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
