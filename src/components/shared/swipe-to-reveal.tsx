"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";

interface SwipeToRevealProps {
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
  className?: string;
}

export function SwipeToReveal({
  onEdit,
  onDelete,
  children,
  className = "",
}: SwipeToRevealProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const ACTION_WIDTH = 72;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const diff = startXRef.current - e.touches[0].clientX;

      // Only allow swiping (positive = left, negative = right)
      if (diff > 0) {
        // Swiping left → reveal edit (clamped to ACTION_WIDTH)
        setOffsetX(Math.min(diff, ACTION_WIDTH));
      } else {
        // Swiping right → reveal delete (clamped to -ACTION_WIDTH)
        setOffsetX(Math.max(diff, -ACTION_WIDTH));
      }
    },
    [isDragging]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    // Snap: if swiped past half, reveal; otherwise snap back
    if (offsetX > ACTION_WIDTH / 2) {
      setOffsetX(ACTION_WIDTH);
    } else if (offsetX < -ACTION_WIDTH / 2) {
      setOffsetX(-ACTION_WIDTH);
    } else {
      setOffsetX(0);
    }
  }, [offsetX]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOffsetX(0);
      }
    }
    if (offsetX !== 0) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [offsetX]);

  // Close on escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOffsetX(0);
    }
    if (offsetX !== 0) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [offsetX]);

  const revealedSide = offsetX > 0 ? "left" : offsetX < 0 ? "right" : null;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Left action (Edit) - revealed when swiping left */}
      <div
        className={`absolute left-0 top-0 bottom-0 flex items-center justify-center w-[72px] transition-colors ${
          revealedSide === "left"
            ? "bg-blue-500 text-white"
            : "bg-muted text-muted-foreground"
        }`}
        onClick={() => {
          onEdit();
          setOffsetX(0);
        }}
      >
        <Pencil className="h-4 w-4" />
      </div>

      {/* Right action (Delete) - revealed when swiping right */}
      <div
        className={`absolute right-0 top-0 bottom-0 flex items-center justify-center w-[72px] transition-colors ${
          revealedSide === "right"
            ? "bg-destructive text-white"
            : "bg-muted text-muted-foreground"
        }`}
        onClick={() => {
          onDelete();
          setOffsetX(0);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </div>

      {/* Main content */}
      <div
        className="relative bg-background z-10 transition-transform"
        style={{
          transform: `translateX(${-offsetX}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>

      {/* Swipe hint - visible on first load for mobile */}
      {offsetX === 0 && !isDragging && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none lg:hidden z-20">
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
