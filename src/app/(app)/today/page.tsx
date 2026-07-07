import { getDashboardData } from "@/features/dashboard/lib/queries";
import { TopThree } from "@/features/dashboard/components/top-three";
import { AllOpenTasks } from "@/features/dashboard/components/all-open-tasks";
import { TodaysClasses } from "@/features/dashboard/components/todays-classes";
import { UpNext } from "@/features/dashboard/components/up-next";
import { AttendanceAlerts } from "@/features/dashboard/components/attendance-alerts";
import { RoutinesWidget } from "@/features/dashboard/components/routines-widget";
import { SemesterSnapshot } from "@/features/dashboard/components/semester-snapshot";
import { TomorrowRoutines } from "@/features/dashboard/components/tomorrow-routines";
import { ContributionGraph } from "@/features/dashboard/components/contribution-graph";
import { AiInsights } from "@/features/dashboard/components/ai-insights";
import { DailyQuote } from "@/features/dashboard/components/daily-quote";
import { OngoingProjects } from "@/features/dashboard/components/ongoing-projects";

export default async function TodayPage() {
  const data = await getDashboardData();

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

      {/* Desktop: 3-column layout. Mobile: stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        {/* Main column (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-8">
          <TopThree tasks={data.topTasks} />
          <AllOpenTasks tasks={data.allOpenTasks} />
          <TodaysClasses classes={data.todayClasses} />
          <UpNext deadlines={data.upcomingDeadlines} />
          <OngoingProjects projects={data.activeProjects} />
        </div>

        {/* Right sidebar (1/3 width on desktop) */}
        <div className="space-y-8">
          <AttendanceAlerts alerts={data.attendanceAlerts} />
          <RoutinesWidget routines={data.routines} />
          <TomorrowRoutines routines={data.tomorrowRoutines} />
          <DailyQuote quotes={data.quotes} />
          <AiInsights />
          <SemesterSnapshot sgpa={data.sgpa} cgpa={data.cgpa} />
          <ContributionGraph streakData={data.streakData} />
        </div>
      </div>
    </div>
  );
}
