import { Sidebar } from "@/components/layout/sidebar";
import { MobileTabs } from "@/components/layout/mobile-tabs";
import { FabCluster } from "@/components/layout/fab-cluster";
import { SearchOverlay } from "@/features/search/components/search-overlay";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { PageTransition } from "@/components/shared/page-transition";




export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Offline banner */}
      <OfflineBanner />

      {/* Global search overlay (⌘K) */}
      <SearchOverlay />

      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <main className="lg:pl-64 min-h-screen pb-24 lg:pb-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-8 py-6 md:py-8 lg:py-10" style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))" }}>
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
