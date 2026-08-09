import { getAllCourses } from "@/features/settings/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { GradingTableEditor } from "@/features/settings/components/grading-table-editor";
import { AttendanceTableEditor } from "@/features/settings/components/attendance-table-editor";
import { AIProviderSettings } from "@/features/settings/components/ai-provider-settings";
import { GoogleCalendarSettings } from "@/features/settings/components/google-calendar-settings";
import { WidgetAccessSettings } from "@/features/settings/components/widget-access-settings";
import { NotificationSettings } from "@/features/notifications/components/notification-settings";
import { NotificationTypeToggles } from "@/features/notifications/components/notification-type-toggles";
import { DailySummarySettings } from "@/features/notifications/components/daily-summary-settings";
import { NotificationWeeklyStats } from "@/features/notifications/components/notification-weekly-stats";
import { ThemeCustomizer } from "@/features/settings/components/theme-customizer";
import { getDashboardLayout } from "@/features/dashboard/lib/actions";
export const revalidate = 0;

import {
  getNotificationPreferences,
  getDailySummaryPreferences,
} from "@/features/notifications/lib/actions";

export default async function SettingsPage() {
  const courses = await getAllCourses();
  const [notificationPreferences, dailySummaryPrefs, dashboardLayout] = await Promise.all([
    getNotificationPreferences(),
    getDailySummaryPreferences(),
    getDashboardLayout(),
  ]);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure grading, attendance, integrations, and preferences"
      />

      <div className="space-y-10">
        {/* Appearance */}
        <section>
          <h2 className="page-heading text-lg mb-6">Appearance</h2>
          <ThemeCustomizer
            initialAccentColor={dashboardLayout.accentColor}
            initialThemeMode={dashboardLayout.themeMode}
          />
        </section>

        {/* Grading & Attendance */}
        <section className="border-t border-border pt-10">
          <GradingTableEditor courses={courses} />
        </section>

        <section>
          <AttendanceTableEditor courses={courses} />
        </section>

        {/* Integrations */}
        <section className="border-t border-border pt-10">
          <h2 className="page-heading text-lg mb-6">Integrations</h2>
          <div className="space-y-6">
            <AIProviderSettings />
            <GoogleCalendarSettings />
            <WidgetAccessSettings />
          </div>
        </section>

        {/* Notifications */}
        <section className="border-t border-border pt-10">
          <h2 className="page-heading text-lg mb-6">Notifications</h2>
          <div className="space-y-6">
            <NotificationSettings />
            <NotificationTypeToggles initialPreferences={notificationPreferences} />
            {dailySummaryPrefs && (
              <DailySummarySettings
                initialTime={dailySummaryPrefs.time}
                initialSections={dailySummaryPrefs.sections}
                initialTimezone={dailySummaryPrefs.timezone}
              />
            )}
            <NotificationWeeklyStats />
          </div>
        </section>
      </div>
    </div>
  );
}
