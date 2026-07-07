import { Sidebar } from "@/components/layout/sidebar";
import { MobileTabs } from "@/components/layout/mobile-tabs";
import { FabCluster } from "@/components/layout/fab-cluster";
import { SearchOverlay } from "@/features/search/components/search-overlay";
import { OfflineBanner } from "@/components/shared/offline-banner";

// All pages in this layout query the database — force dynamic rendering.
export const dynamic = "force-dynamic";

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
      <main className="lg:pl-64 min-h-screen pb-20 lg:pb-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <MobileTabs />

      {/* Mobile FAB cluster */}
      <FabCluster />
    </div>
  );
}
