"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Brain,
  Heart,
  BookOpen,
  Dumbbell,
  Music,
  Palette,
  Code,
  Leaf,
  Users,
  Clock,
  Target,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createIdentity, updateIdentity } from "../lib/actions";
import type { Identity, IdentityStatus } from "@prisma/client";

const COLORS = [
  "#6B7FA3",
  "#7A9E7E",
  "#C4868C",
  "#C49B5C",
  "#9B8EC4",
  "#E54D2E",
  "#6B6B6B",
  "#4A9B8E",
  "#B07BAC",
  "#8B7355",
];

const ICONS = [
  { name: "Brain", Icon: Brain },
  { name: "Heart", Icon: Heart },
  { name: "BookOpen", Icon: BookOpen },
  { name: "Dumbbell", Icon: Dumbbell },
  { name: "Music", Icon: Music },
  { name: "Palette", Icon: Palette },
  { name: "Code", Icon: Code },
  { name: "Leaf", Icon: Leaf },
  { name: "Users", Icon: Users },
  { name: "Clock", Icon: Clock },
  { name: "Target", Icon: Target },
  { name: "Flame", Icon: Flame },
];

const STATUS_OPTIONS: { value: IdentityStatus; label: string }[] = [
  { value: "aspirational", label: "Aspirational" },
  { value: "developing", label: "Developing" },
  { value: "integrated", label: "Integrated" },
  { value: "neglected", label: "Neglected" },
];

export function IdentityForm({
  userId,
  identity,
}: {
  userId: string;
  identity?: Identity;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(
    identity?.color ?? null
  );
  const [selectedIcon, setSelectedIcon] = useState<string | null>(
    identity?.icon ?? null
  );
  const router = useRouter();

  const isEdit = !!identity;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      statement: formData.get("statement") as string,
      description: (formData.get("description") as string) || undefined,
      status: formData.get("status") as IdentityStatus,
      color: selectedColor,
      icon: selectedIcon,
    };

    if (isEdit) {
      await updateIdentity(identity.id, {
        ...data,
        color: data.color ?? undefined,
        icon: data.icon ?? undefined,
      });
    } else {
      await createIdentity({
        userId,
        ...data,
        color: data.color ?? undefined,
        icon: data.icon ?? undefined,
      });
    }

    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          ) : (
            <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" />
              New Identity
            </button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {isEdit ? "Edit Identity" : "New Identity"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Statement */}
          <div className="space-y-2">
            <label htmlFor="statement" className="section-label">
              I am a...
            </label>
            <input
              id="statement"
              name="statement"
              defaultValue={identity?.statement}
              placeholder="disciplined researcher"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="section-label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              defaultValue={identity?.description ?? ""}
              placeholder="Optional elaboration on what this identity means to you..."
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label htmlFor="status" className="section-label">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={identity?.status ?? "aspirational"}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <label className="section-label">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() =>
                    setSelectedColor(selectedColor === color ? null : color)
                  }
                  className={cn(
                    "h-7 w-7 rounded-full transition-all",
                    selectedColor === color &&
                      "ring-2 ring-offset-2 ring-foreground/30"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Icon picker */}
          <div className="space-y-2">
            <label className="section-label">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(({ name, Icon }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    setSelectedIcon(selectedIcon === name ? null : name)
                  }
                  className={cn(
                    "h-9 w-9 rounded-md flex items-center justify-center transition-colors",
                    selectedIcon === name
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading
              ? isEdit
                ? "Saving..."
                : "Creating..."
              : isEdit
                ? "Save Changes"
                : "Create Identity"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
