import { getDashboardData } from "@/features/dashboard/lib/queries";
import { getCurrentUserId } from "@/lib/auth";
import { getDashboardLayout } from "@/features/dashboard/lib/actions";
import { TodayDashboard } from "@/features/dashboard/components/today-dashboard";
import { UnifiedInsights } from "@/features/insights/components/UnifiedInsights";

// This page reads from the database on every request.
export const revalidate = 0;

export default async function TodayPage() {
  const userId = await getCurrentUserId();
  const [data, layout] = await Promise.all([
    getDashboardData(),
    getDashboardLayout(),
  ]);

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      {/* Date header */}
      <div className="mb-8">
        <h1 className="page-heading">{formattedDate}</h1>
      </div>

      <TodayDashboard
        data={data}
        widgetOrder={layout.widgetOrder as string[]}
        hiddenWidgets={layout.hiddenWidgets}
        userId={userId}
        unifiedInsights={<UnifiedInsights />}
      />
    </div>
  );
}
