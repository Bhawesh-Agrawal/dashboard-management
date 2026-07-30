import { getDashboardData } from "@/features/dashboard/lib/queries";
import { TopThree } from "@/features/dashboard/components/top-three";
import { AllOpenTasks } from "@/features/dashboard/components/all-open-tasks";
import { TodaysClasses } from "@/features/dashboard/components/todays-classes";
import { UpNext } from "@/features/dashboard/components/up-next";
import { AttendanceAlerts } from "@/features/dashboard/components/attendance-alerts";
import { RoutinesWidget } from "@/features/dashboard/components/routines-widget";
import { SemesterSnapshot } from "@/features/dashboard/components/semester-snapshot";
import { TomorrowRoutines } from "@/features/dashboard/components/tomorrow-routines";
import { DailyQuote } from "@/features/dashboard/components/daily-quote";
import { OngoingProjects } from "@/features/dashboard/components/ongoing-projects";
import { DailyTimeline } from "@/features/dashboard/components/daily-timeline";
import { KnowledgeHealthWidget } from "@/features/dashboard/components/knowledge-health-widget";
import { FocusCarousel } from "@/features/dashboard/components/focus-carousel";
import dynamic from "next/dynamic";

// This page reads from the database on every request.
export const revalidate = 0;


const ContributionGraph = dynamic(
  () => import("@/features/dashboard/components/contribution-graph").then((mod) => mod.ContributionGraph),
  { loading: () => <div className="h-32 bg-muted animate-pulse rounded-md" /> }
);

const UnifiedInsights = dynamic(
  () => import("@/features/insights/components/UnifiedInsights").then((mod) => mod.UnifiedInsights),
  { loading: () => <div className="h-32 bg-muted animate-pulse rounded-md" /> }
);

const IdentityHealthWidget = dynamic(
  () => import("@/features/identities/components/IdentityHealthWidget").then((mod) => mod.IdentityHealthWidget),
  { loading: () => <div className="h-24 bg-muted animate-pulse rounded-md" /> }
);

const EnergyMap = dynamic(
  () => import("@/features/routines/components/EnergyMap").then((mod) => mod.EnergyMap),
  { loading: () => <div className="h-40 bg-muted animate-pulse rounded-md" /> }
);

const ReviewPreviewWidget = dynamic(
  () => import("@/features/reviews/components/review-preview-widget").then((mod) => mod.ReviewPreviewWidget),
  { loading: () => <div className="h-24 bg-muted animate-pulse rounded-md" /> }
);

import { getCurrentUserId } from "@/lib/auth";

export default async function TodayPage() {
  const userId = await getCurrentUserId();
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

      {/* Desktop: 3-column layout. Mobile: stacked. Tablet: 2-column */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-12">
        {/* Main column (2/3 width on desktop) */}
        <div className="md:col-span-2 lg:col-span-2 space-y-6 md:space-y-8">
          <TopThree tasks={data.topTasks} />
          <DailyTimeline 
            classes={data.todayClasses} 
            deadlines={data.upcomingDeadlines} 
            routines={data.routines} 
          />
          <UpNext 
            deadlines={data.upcomingDeadlines.filter(d => new Date(d.date).toDateString() !== today.toDateString())} 
          />
          <AllOpenTasks tasks={data.allOpenTasks} />
          <OngoingProjects projects={data.activeProjects} />
        </div>

        {/* Right sidebar (1/3 width on desktop) */}
        <div className="space-y-6 md:space-y-8">
          <ReviewPreviewWidget
            review={data.latestReview}
            unviewedCount={data.unviewedReviewCount}
          />
          <KnowledgeHealthWidget
            noteCount={data.knowledgeStats.noteCount}
            connectionCount={data.knowledgeStats.connectionCount}
            gapCount={data.knowledgeStats.gapCount}
            reviewsDue={data.reviewStats.notesDueToday}
          />
          <AttendanceAlerts alerts={data.attendanceAlerts} />
          <TomorrowRoutines 
            routines={data.tomorrowRoutines.filter(tr => !data.routines.some(r => r.id === tr.id))} 
          />
          <DailyQuote quotes={data.quotes} />
          <FocusCarousel
            streakData={data.streakData}
            topTasks={data.topTasks}
            todayClasses={data.todayClasses}
            routines={data.routines}
          />
          <IdentityHealthWidget userId={userId} />
          <UnifiedInsights />
          <SemesterSnapshot sgpa={data.sgpa} cgpa={data.cgpa} />
        </div>
      </div>
    </div>
  );
}
