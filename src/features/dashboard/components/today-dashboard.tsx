"use client";

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
import { ActiveUpcoming } from "@/features/dashboard/components/active-upcoming";
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
}: {
  data: DashboardData;
  widgetOrder: string[];
  hiddenWidgets: string[];
  userId: string;
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
        return <SemesterSnapshot sgpa={data.sgpa} cgpa={data.cgpa} />;
      case "ContributionGraph":
        return <ContributionGraph streakData={data.streakData} />;
      case "ActiveUpcoming":
        return <ActiveUpcoming todayClasses={data.todayClasses} />;
      default:
        return null;
    }
  };

  return (
    <DashboardGrid
      mainWidgets={layout.main}
      sidebarWidgets={layout.sidebar}
      hiddenWidgets={hiddenWidgets}
      renderWidget={renderWidget}
    />
  );
}
