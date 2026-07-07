"use client";

import { useState } from "react";
import { updateBudgetEntry } from "@/features/budget/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

type EntryData = {
  id: string;
  type: string;
  amount: { toString(): string };
  category: string;
  date: Date;
  notes: string | null;
};

const CATEGORIES = [
  "Food",
  "Rent",
  "Books",
  "Subscriptions",
  "Transport",
  "Entertainment",
  "Health",
  "Other",
];

export function EditBudgetDialog({ entry }: { entry: EntryData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const dateStr = new Date(entry.date).toISOString().split("T")[0];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await updateBudgetEntry(entry.id, {
      type: formData.get("type") as "income" | "expense",
      amount: parseFloat(formData.get("amount") as string),
      category: formData.get("category") as string,
      date: formData.get("date") as string,
      notes: (formData.get("notes") as string) || undefined,
    });

    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="p-1 rounded hover:bg-accent transition-colors" />}>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-type" className="section-label">Type</label>
              <select
                id="edit-type"
                name="type"
                defaultValue={entry.type}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-amount" className="section-label">Amount (₹)</label>
              <input
                id="edit-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={Number(entry.amount)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-category" className="section-label">Category</label>
              <select
                id="edit-category"
                name="category"
                defaultValue={entry.category}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-date" className="section-label">Date</label>
              <input
                id="edit-date"
                name="date"
                type="date"
                required
                defaultValue={dateStr}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-notes" className="section-label">Notes</label>
            <input
              id="edit-notes"
              name="notes"
              defaultValue={entry.notes || ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
