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
import { BudgetForm, type BudgetFormData } from "./BudgetForm";

type EntryData = {
  id: string;
  type: string;
  amount: number;
  category: string;
  date: Date;
  notes: string | null;
};

export function EditBudgetDialog({ entry }: { entry: EntryData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(data: BudgetFormData) {
    setLoading(true);
    await updateBudgetEntry(entry.id, {
      type: data.type,
      amount: data.amount,
      category: data.category,
      date: data.date,
      notes: data.notes,
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
        <BudgetForm
          mode="full"
          entry={entry}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}
