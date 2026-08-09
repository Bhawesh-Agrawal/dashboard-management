"use client";

export type BudgetFormMode = "quick" | "full";

export interface BudgetFormData {
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
  notes?: string;
}

interface BudgetFormEntry {
  id: string;
  type: string;
  amount: number;
  category: string;
  date: Date;
  notes: string | null;
}

interface BudgetFormProps {
  mode?: BudgetFormMode;
  entry?: BudgetFormEntry;
  onSubmit: (data: BudgetFormData) => Promise<void>;
  onDone?: () => void;
  loading?: boolean;
  submitLabel?: string;
}

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

export function BudgetForm({
  mode = "full",
  entry,
  onSubmit,
  onDone,
  loading = false,
  submitLabel,
}: BudgetFormProps) {
  const isEditing = !!entry;
  const dateStr = entry ? new Date(entry.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

  const defaultSubmitLabel = isEditing
    ? loading ? "Saving..." : "Save Changes"
    : loading ? "Creating..." : "Create Entry";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    await onSubmit({
      type: formData.get("type") as "income" | "expense",
      amount: parseFloat(formData.get("amount") as string),
      category: formData.get("category") as string,
      date: formData.get("date") as string,
      notes: (formData.get("notes") as string) || undefined,
    });

    onDone?.();
  }

  const inputClass = mode === "quick"
    ? "flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    : "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor={`bf-type${isEditing ? `-${entry.id}` : ""}`} className="section-label">Type</label>
          <select
            id={`bf-type${isEditing ? `-${entry.id}` : ""}`}
            name="type"
            defaultValue={entry?.type ?? "expense"}
            className={inputClass}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor={`bf-amount${isEditing ? `-${entry.id}` : ""}`} className="section-label">Amount (INR)</label>
          <input
            id={`bf-amount${isEditing ? `-${entry.id}` : ""}`}
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            autoFocus
            defaultValue={entry ? Number(entry.amount) : undefined}
            className={inputClass}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor={`bf-category${isEditing ? `-${entry.id}` : ""}`} className="section-label">Category</label>
          <select
            id={`bf-category${isEditing ? `-${entry.id}` : ""}`}
            name="category"
            required
            defaultValue={entry?.category}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor={`bf-date${isEditing ? `-${entry.id}` : ""}`} className="section-label">Date</label>
          <input
            id={`bf-date${isEditing ? `-${entry.id}` : ""}`}
            name="date"
            type="date"
            required
            defaultValue={dateStr}
            className={inputClass}
          />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor={`bf-notes${isEditing ? `-${entry.id}` : ""}`} className="section-label">Notes</label>
        <input
          id={`bf-notes${isEditing ? `-${entry.id}` : ""}`}
          name="notes"
          defaultValue={entry?.notes || ""}
          className={inputClass}
          placeholder="Optional notes..."
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {submitLabel || defaultSubmitLabel}
      </button>
    </form>
  );
}
