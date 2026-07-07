import { PageHeader } from "@/components/shared/page-header";
import { getLibraryData } from "@/features/library/lib/queries";
import { QuoteList } from "@/features/library/components/quote-list";
import { CreateQuoteDialog } from "@/features/library/components/quote-form";
import { ResourceList } from "@/features/library/components/resource-list";
import { CreateResourceDialog } from "@/features/library/components/resource-form";

export default async function LibraryPage() {
  const { quotes, resources } = await getLibraryData();

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle={`${quotes.length} quotes · ${resources.length} resources`}
      />

      <div className="space-y-10">
        {/* Quotes */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label">Quotes · {quotes.length}</h2>
            <CreateQuoteDialog />
          </div>
          <QuoteList quotes={quotes} />
        </section>

        {/* Resources */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-label">Resources · {resources.length}</h2>
            <CreateResourceDialog />
          </div>
          <ResourceList resources={resources} />
        </section>
      </div>
    </div>
  );
}
