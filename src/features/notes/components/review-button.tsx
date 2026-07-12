"use client";

import { useState } from "react";
import { CheckCircle, BookOpen } from "lucide-react";
import { reviewNote } from "@/features/notes/lib/actions";

type ReviewButtonProps = {
  noteId: string;
};

export function ReviewButton({ noteId }: ReviewButtonProps) {
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReview = async () => {
    if (loading || reviewed) return;

    setLoading(true);
    try {
      await reviewNote(noteId);
      setReviewed(true);
    } catch (error) {
      console.error("Failed to mark note as reviewed:", error);
    } finally {
      setLoading(false);
    }
  };

  if (reviewed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-600">
        <CheckCircle className="w-3.5 h-3.5" />
        Reviewed
      </span>
    );
  }

  return (
    <button
      onClick={handleReview}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      <BookOpen className="w-3.5 h-3.5" />
      {loading ? "Reviewing..." : "Mark as Reviewed"}
    </button>
  );
}
