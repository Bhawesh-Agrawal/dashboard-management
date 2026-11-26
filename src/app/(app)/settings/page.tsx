import { getAllCourses } from "@/features/settings/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { GradingTableEditor } from "@/features/settings/components/grading-table-editor";
import { AttendanceTableEditor } from "@/features/settings/components/attendance-table-editor";
import { AIProviderSettings } from "@/features/settings/components/ai-provider-settings";
import { GoogleCalendarSettings } from "@/features/settings/components/google-calendar-settings";
import { WidgetAccessSettings } from "@/features/settings/components/widget-access-settings";
import { NotificationSettings } from "@/features/notifications/components/notification-settings";
import { NotificationTypeToggles } from "@/features/notifications/components/notification-type-toggles";
import { NotificationWeeklyStats } from "@/features/notifications/components/notification-weekly-stats";
import { ThemeCustomizer } from "@/features/settings/components/theme-customizer";
import { TimezoneSettings } from "@/features/settings/components/timezone-settings";
import { getDashboardLayout } from "@/features/dashboard/lib/actions";
import { getUserTimezone } from "@/lib/timezone-server";
export const revalidate = 0;

import {
  getNotificationPreferences,
  getWeatherLocationAction,
  getBriefScheduleSettingsAction,
} from "@/features/notifications/lib/actions";
import { LocationSettings } from "@/features/notifications/components/location-settings";
import { BriefScheduleSettings } from "@/features/notifications/components/brief-schedule-settings";

export default async function SettingsPage() {
  let courses: Awaited<ReturnType<typeof getAllCourses>> = [];
  let notificationPreferences: Awaited<ReturnType<typeof getNotificationPreferences>> = [];
  let dashboardLayout: Awaited<ReturnType<typeof getDashboardLayout>> = {
    widgetOrder: [],
    hiddenWidgets: [],
    accentColor: null,
    themeMode: "light",
  };

  let userTimezone = "Asia/Kathmandu";

  let weatherLocation: Awaited<ReturnType<typeof getWeatherLocationAction>> = {
    name: null,
    latitude: null,
    longitude: null,
  };

  let briefSchedule: Awaited<ReturnType<typeof getBriefScheduleSettingsAction>> = {
    morningEnabled: true,
    morningTime: "07:00",
    eveningEnabled: true,
    eveningTime: "20:30",
    classReminderMinutes: 10,
    eventReminderMinutes: 15,
    quietHoursStart: "22:00",
    quietHoursEnd: "06:30",
  };

  try {
    [courses, notificationPreferences, dashboardLayout, userTimezone, weatherLocation, briefSchedule] = await Promise.all([
      getAllCourses().catch(() => []),
      getNotificationPreferences().catch(() => []),
      getDashboardLayout().catch(() => ({
        widgetOrder: [],
        hiddenWidgets: [],
        accentColor: null,
        themeMode: "light",
      })),
      getUserTimezone().catch(() => "Asia/Kathmandu"),
      getWeatherLocationAction().catch(() => ({ name: null, latitude: null, longitude: null })),
      getBriefScheduleSettingsAction().catch(() => briefSchedule),
    ]);
  } catch {
    // All fallbacks are already set above
  }

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

        {/* Timezone */}
        <section className="border-t border-border pt-10">
          <h2 className="page-heading text-lg mb-6">Timezone</h2>
          <TimezoneSettings initialTimezone={userTimezone} />
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
            <NotificationTypeToggles
              key={JSON.stringify(notificationPreferences)}
              initialPreferences={notificationPreferences}
            />
            <BriefScheduleSettings initial={briefSchedule} />
            <LocationSettings
              initialName={weatherLocation.name}
              initialLat={weatherLocation.latitude}
              initialLon={weatherLocation.longitude}
            />
            <NotificationWeeklyStats />
          </div>
        </section>
      </div>
    </div>
  );
}
