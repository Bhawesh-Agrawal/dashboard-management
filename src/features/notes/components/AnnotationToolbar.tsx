"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Highlighter,
  Underline,
  Strikethrough,
  StickyNote,
  Star,
  Download,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AnnotationTool } from "@/features/notes/lib/annotation-utils";
import { HIGHLIGHT_COLORS } from "@/features/notes/lib/annotation-utils";

export interface AnnotationToolbarProps {
  activeTool: AnnotationTool | null;
  activeColor: string;
  onToolChange: (tool: AnnotationTool | null) => void;
  onColorChange: (color: string) => void;
  onExport: () => void;
  visible: boolean;
}

const TOOLS: {
  id: AnnotationTool;
  label: string;
  icon: typeof Highlighter;
  shortcut: string;
}[] = [
  { id: "highlight", label: "Highlight", icon: Highlighter, shortcut: "H" },
  { id: "underline", label: "Underline", icon: Underline, shortcut: "U" },
  { id: "strikeout", label: "Strikeout", icon: Strikethrough, shortcut: "S" },
  { id: "note", label: "Note", icon: StickyNote, shortcut: "N" },
  { id: "bookmark", label: "Bookmark", icon: Star, shortcut: "B" },
];

export function AnnotationToolbar({
  activeTool,
  activeColor,
  onToolChange,
  onColorChange,
  onExport,
  visible,
}: AnnotationToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const handleColorPickerOutside = useCallback(
    (e: MouseEvent) => {
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!showColorPicker) return;
    document.addEventListener("mousedown", handleColorPickerOutside);
    return () =>
      document.removeEventListener("mousedown", handleColorPickerOutside);
  }, [showColorPicker, handleColorPickerOutside]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-16 left-1/2 -translate-x-1/2 z-40",
        "flex items-center gap-1 p-1.5",
        "bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-lg",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
      )}
    >
      {/* Tool buttons */}
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <Button
            key={tool.id}
            variant={isActive ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => onToolChange(isActive ? null : tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className={cn(
              "min-h-[32px] min-w-[32px]",
              isActive && "shadow-sm"
            )}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}

      {/* Divider */}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Color picker */}
      <div className="relative" ref={colorPickerRef}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowColorPicker((v) => !v)}
          title="Pick color"
          className="min-h-[32px] min-w-[32px]"
        >
          <div className="flex items-center gap-1">
            <Palette className="h-4 w-4" />
            <div
              className="w-2.5 h-2.5 rounded-full border border-border"
              style={{ backgroundColor: activeColor }}
            />
          </div>
        </Button>

        {showColorPicker && (
          <div
            className={cn(
              "absolute bottom-full left-1/2 -translate-x-1/2 mb-2",
              "flex items-center gap-1.5 p-2",
              "bg-popover border border-border rounded-lg shadow-lg",
              "animate-in fade-in-0 zoom-in-95 duration-150"
            )}
          >
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onColorChange(color);
                  setShowColorPicker(false);
                }}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                  activeColor === color
                    ? "border-foreground scale-110"
                    : "border-transparent"
                )}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Export button */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onExport}
        title="Export annotations"
        className="min-h-[32px] min-w-[32px]"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}
