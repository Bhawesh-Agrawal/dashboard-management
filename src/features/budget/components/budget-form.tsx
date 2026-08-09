"use client";

import { useState } from "react";
import { createBudgetEntry } from "@/features/budget/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { BudgetForm, type BudgetFormData } from "./BudgetForm";

export function CreateBudgetDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(data: BudgetFormData) {
    setLoading(true);
    await createBudgetEntry({
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
      <DialogTrigger render={<button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
          <Plus className="h-4 w-4" />
          New Entry
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Budget Entry</DialogTitle>
        </DialogHeader>
        <BudgetForm
          mode="full"
          onSubmit={handleSubmit}
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}
