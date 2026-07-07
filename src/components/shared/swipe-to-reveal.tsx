"use client";

import { useState, useRef, useEffect } from "react";

interface SwipeToRevealProps {
  children: React.ReactNode;
  actions: React.ReactNode;
  className?: string;
}

export function SwipeToReveal({ children, actions, className = "" }: SwipeToRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const actionsWidth = 80; // Width of action buttons

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentXPos = e.touches[0].clientX;
    const diff = startX - currentXPos;
    
    // Only allow swiping left (negative values)
    if (diff > 0) {
      setCurrentX(Math.min(diff, actionsWidth));
    } else {
      setCurrentX(0);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    // If swiped more than half the action width, reveal actions
    if (currentX > actionsWidth / 2) {
      setIsRevealed(true);
      setCurrentX(actionsWidth);
    } else {
      setIsRevealed(false);
      setCurrentX(0);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsRevealed(false);
      setCurrentX(0);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Main content */}
      <div
        className="transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(-${currentX}px)`,
        }}
      >
        {children}
      </div>

      {/* Actions container */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center"
        style={{
          width: `${actionsWidth}px`,
        }}
      >
        {actions}
      </div>

      {/* Touch hint for mobile */}
      {!isRevealed && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 lg:hidden transition-opacity">
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
