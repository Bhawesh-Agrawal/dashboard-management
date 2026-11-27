import { Sidebar } from "@/components/layout/sidebar";
import { MobileTabs } from "@/components/layout/mobile-tabs";
import { FabCluster } from "@/components/layout/fab-cluster";
import { SearchOverlay } from "@/features/search/components/search-overlay";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { PageTransition } from "@/components/shared/page-transition";
import { AccentSetter } from "@/components/shared/accent-setter";
import { getDashboardLayout } from "@/features/dashboard/lib/actions";

export const dynamic = "force-dynamic";

import { OverdueBanner } from "@/components/layout/overdue-banner";
import { KeyboardFocusHelper } from "@/components/shared/keyboard-focus-helper";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const layout = await getDashboardLayout();

  return (
    <div className="min-h-dvh bg-background">
      <KeyboardFocusHelper />
      <AccentSetter accentColor={layout.accentColor} />
      {/* Offline banner */}
      <OfflineBanner />

      {/* Global search overlay (⌘K) */}
      <SearchOverlay />

      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <main className="lg:pl-64 min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {/* Persistent Overdue Tasks Banner */}
        <OverdueBanner />

        <div
          className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-8 py-6 md:py-8 lg:py-10"
          style={{
            paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))",
            paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
          }}
        >
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <MobileTabs />

      {/* Mobile FAB cluster */}
      <FabCluster />
    </div>
  );
}
