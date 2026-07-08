import { PageHeader } from "@/components/shared/page-header";
import { SearchClient } from "@/features/search/components/search-client";

export const revalidate = 0;

export default function SearchPage() {
  return (
    <div>
      <PageHeader title="Search" subtitle="Find anything across your data" />
      <div className="mt-6">
        <SearchClient />
      </div>
    </div>
  );
}
