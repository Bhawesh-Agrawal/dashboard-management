"use client";

import { deleteQuote } from "@/features/library/lib/actions";
import { EditQuoteDialog } from "./edit-quote-dialog";

type QuoteData = {
  id: string;
  text: string;
  source: string | null;
  tags: string[];
};

export function QuoteList({ quotes }: { quotes: QuoteData[] }) {
  if (quotes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No quotes yet. Add one to save memorable lines.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {quotes.map((quote) => (
        <QuoteRow key={quote.id} quote={quote} />
      ))}
    </div>
  );
}

function QuoteRow({ quote }: { quote: QuoteData }) {
  return (
    <div className="list-row items-start group">
      <div className="flex-1 min-w-0">
        <p className="text-sm italic">&ldquo;{quote.text}&rdquo;</p>
        <div className="flex items-center gap-2 mt-1">
          {quote.source && (
            <span className="text-xs text-muted-foreground">— {quote.source}</span>
          )}
          {quote.tags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {quote.tags.join(", ")}
            </span>
          )}
        </div>
      </div>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
        <EditQuoteDialog quote={quote} />
        <button
          onClick={() => deleteQuote(quote.id)}
          className="p-1 rounded hover:bg-accent transition-colors text-destructive"
        >
          ×
        </button>
      </div>
    </div>
  );
}
