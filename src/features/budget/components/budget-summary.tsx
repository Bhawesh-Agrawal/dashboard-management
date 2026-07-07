type BudgetSummaryData = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  topCategories: [string, number][];
  entryCount: number;
};

export function BudgetSummary({ summary }: { summary: BudgetSummaryData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="section-label">Income</p>
          <p className="text-lg font-medium text-emerald-600 tabular-nums">
            ₹{summary.totalIncome.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="section-label">Expenses</p>
          <p className="text-lg font-medium text-destructive tabular-nums">
            ₹{summary.totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="section-label">Balance</p>
          <p className={`text-lg font-medium tabular-nums ${summary.balance >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            ₹{summary.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {summary.topCategories.length > 0 && (
        <div>
          <p className="section-label mb-2">Top Categories</p>
          <div className="space-y-1">
            {summary.topCategories.map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{category}</span>
                <span className="tabular-nums">₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
