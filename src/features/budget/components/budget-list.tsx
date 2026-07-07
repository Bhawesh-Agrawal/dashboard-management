"use client";

import { deleteBudgetEntry } from "@/features/budget/lib/actions";
import { EditBudgetDialog } from "./edit-budget-dialog";

type BudgetEntryData = {
  id: string;
  type: string;
  amount: { toString(): string };
  category: string;
  date: Date;
  notes: string | null;
};

export function BudgetList({ entries }: { entries: BudgetEntryData[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No entries for this month.
      </p>
    );
  }

  // Group by date
  const grouped = entries.reduce((acc, entry) => {
    const dateKey = new Date(entry.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, BudgetEntryData[]>);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <p className="section-label mb-2">{date}</p>
          <div className="space-y-0.5">
            {items.map((entry) => (
              <BudgetRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BudgetRow({ entry }: { entry: BudgetEntryData }) {
  const amount = Number(entry.amount);
  const isIncome = entry.type === "income";

  return (
    <div className="list-row items-center group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{entry.category}</span>
        </div>
        {entry.notes && (
          <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>
        )}
      </div>

      <span
        className={`text-sm font-medium tabular-nums ${
          isIncome ? "text-emerald-600" : "text-destructive"
        }`}
      >
        {isIncome ? "+" : "-"}₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </span>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <EditBudgetDialog entry={entry} />
        <button
          onClick={() => deleteBudgetEntry(entry.id)}
          className="p-1 rounded hover:bg-accent transition-colors text-destructive"
        >
          ×
        </button>
      </div>
    </div>
  );
}
