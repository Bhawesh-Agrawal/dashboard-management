import { PageHeader } from "@/components/shared/page-header";
import { getBudgetEntries, getBudgetSummary } from "@/features/budget/lib/queries";
import { BudgetList } from "@/features/budget/components/budget-list";
import { BudgetSummary } from "@/features/budget/components/budget-summary";
import { CreateBudgetDialog } from "@/features/budget/components/budget-form";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;
  const year = params.year ? parseInt(params.year) : now.getFullYear();

  const [entries, summary] = await Promise.all([
    getBudgetEntries(month, year),
    getBudgetSummary(month, year),
  ]);

  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Prev/next month links
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle={monthName}
        action={<CreateBudgetDialog />}
      />

      <div className="space-y-8">
        {/* Month navigation */}
        <div className="flex items-center gap-4">
          <a
            href={`/budget?month=${prevMonth}&year=${prevYear}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Prev
          </a>
          <span className="text-sm font-medium">{monthName}</span>
          <a
            href={`/budget?month=${nextMonth}&year=${nextYear}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Next →
          </a>
        </div>

        <BudgetSummary summary={summary} />

        <section>
          <h2 className="section-label mb-3">Entries · {summary.entryCount}</h2>
          <BudgetList entries={entries} />
        </section>
      </div>
    </div>
  );
}
