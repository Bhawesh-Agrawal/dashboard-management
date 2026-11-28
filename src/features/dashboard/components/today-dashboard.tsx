"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { DashboardGrid } from "./dashboard-grid";
import { TopThree } from "@/features/dashboard/components/top-three";
import { AllOpenTasks } from "@/features/dashboard/components/all-open-tasks";
import { UpNext } from "@/features/dashboard/components/up-next";
import { AttendanceAlerts } from "@/features/dashboard/components/attendance-alerts";
import { SemesterSnapshot } from "@/features/dashboard/components/semester-snapshot";
import { TomorrowRoutines } from "@/features/dashboard/components/tomorrow-routines";
import { OngoingProjects } from "@/features/dashboard/components/ongoing-projects";
import { DailyTimeline } from "@/features/dashboard/components/daily-timeline";
import { FocusCarousel } from "@/features/dashboard/components/focus-carousel";
import { TodayClassesCard } from "@/features/attendance/components/today-classes-card";
import { DsaTodayCard } from "@/features/dsa/components/dsa-today-card";
import type { DsaDueSummary } from "@/features/dsa/lib/summary";
import {
  BriefTodayCard,
  type BriefTodaySummary,
} from "@/features/briefs/components/brief-today-card";
import dynamic from "next/dynamic";
import { resolveLayout, type WidgetId } from "../lib/widget-registry";
import type { DashboardData } from "@/types";
import type { ReactNode } from "react";

const ContributionGraph = dynamic(
  () => import("@/features/dashboard/components/contribution-graph").then((mod) => mod.ContributionGraph),
  { loading: () => <div className="h-32 bg-muted animate-pulse rounded-md" /> }
);

const ReviewPreviewWidget = dynamic(
  () => import("@/features/reviews/components/review-preview-widget").then((mod) => mod.ReviewPreviewWidget),
  { loading: () => <div className="h-24 bg-muted animate-pulse rounded-md" /> }
);

export function TodayDashboard({
  data,
  widgetOrder,
  hiddenWidgets,
  userId,
  dsaSummary,
  briefSummary,
  todayAcademicLines,
}: {
  data: DashboardData;
  widgetOrder: string[];
  hiddenWidgets: string[];
  userId: string;
  dsaSummary?: DsaDueSummary | null;
  briefSummary?: BriefTodaySummary | null;
  todayAcademicLines?: string[];
}) {
  const [layout, setLayout] = useState(() => resolveLayout(widgetOrder));
  const today = new Date();

  // Listen for layout changes from drag-and-drop
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setLayout({
        main: e.detail.mainWidgets,
        sidebar: e.detail.sidebarWidgets,
      });
    };
    window.addEventListener("dashboard-layout-change", handler as EventListener);
    return () => window.removeEventListener("dashboard-layout-change", handler as EventListener);
  }, []);

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case "TopThree":
        return <TopThree tasks={data.topTasks} />;
      case "DailyTimeline":
        return (
          <DailyTimeline
            classes={data.todayClasses}
            deadlines={data.upcomingDeadlines}
            routines={data.routines}
          />
        );
      case "UpNext":
        return (
          <UpNext
            deadlines={data.upcomingDeadlines.filter(
              (d) => {
                const itemDate = new Date(d.date);
                const isToday = itemDate.toDateString() === today.toDateString();
                const isPast = itemDate < today && !isToday;
                // Remove overdue tasks (already shown in Overdue Banner + Task tab)
                if (isPast && d.type === "task") return false;
                // Remove today's deadlines (shown in DailyTimeline)
                if (isToday) return false;
                return true;
              }
            )}
          />
        );
      case "AllOpenTasks":
        return <AllOpenTasks tasks={data.allOpenTasks} />;
      case "OngoingProjects":
        return <OngoingProjects projects={data.activeProjects} />;
      case "ReviewPreviewWidget":
        return (
          <ReviewPreviewWidget
            review={data.latestReview}
            unviewedCount={data.unviewedReviewCount}
          />
        );
      case "AttendanceAlerts":
        if (data.hasCurrentSemester === false) return null;
        return <AttendanceAlerts alerts={data.attendanceAlerts} />;
      case "TomorrowRoutines":
        return (
          <TomorrowRoutines
            routines={data.tomorrowRoutines.filter(
              (tr) => !data.routines.some((r) => r.id === tr.id)
            )}
          />
        );
      case "FocusCarousel":
        return (
          <FocusCarousel
            streakData={data.streakData}
            topTasks={data.topTasks}
            todayClasses={data.todayClasses}
            routines={data.routines}
          />
        );
      case "SemesterSnapshot":
        if (data.hasCurrentSemester === false) return null;
        return <SemesterSnapshot sgpa={data.sgpa} cgpa={data.cgpa} />;
      case "ContributionGraph":
        return <ContributionGraph streakData={data.streakData} />;
      case "ActiveUpcoming":
        if (data.hasCurrentSemester === false) return null;
        return <TodayClassesCard todayClasses={data.todayClasses} />;
      case "DsaSummary":
        return <DsaTodayCard summary={dsaSummary} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {todayAcademicLines && todayAcademicLines.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm space-y-1">
          {todayAcademicLines.map((line, i) => (
            <p key={i} className="text-foreground">
              {line}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end">
        <Link
          href={`/ask?prompt=${encodeURIComponent("What does my day look like?")}`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
        >
          Ask about today
        </Link>
      </div>
      <BriefTodayCard summary={briefSummary} />
      {data.hasCurrentSemester === false && data.upcomingSemester && !data.upcomingSemester.hasTimetable ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-foreground">
            Semester starts in {data.upcomingSemester.daysUntilStart}{" "}
            {data.upcomingSemester.daysUntilStart === 1 ? "day" : "days"}, timetable not added yet
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/semesters/${data.upcomingSemester.id}/timetable`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px]"
            >
              Add timetable
            </Link>
            <Link
              href={`/semesters/${data.upcomingSemester.id}/calendar`}
              className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent min-h-[44px]"
            >
              Academic calendar
            </Link>
          </div>
        </div>
      ) : (
        data.hasCurrentSemester === false &&
        !data.upcomingSemester && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <span className="text-muted-foreground">No active semester</span>
            <Link
              href="/semesters"
              className="font-medium text-primary hover:underline min-h-[44px] inline-flex items-center"
            >
              Add semester
            </Link>
          </div>
        )
      )}
      <DashboardGrid
        mainWidgets={layout.main}
        sidebarWidgets={layout.sidebar}
        hiddenWidgets={hiddenWidgets}
        renderWidget={renderWidget}
      />
    </div>
  );
}
