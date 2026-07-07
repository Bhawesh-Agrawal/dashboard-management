import { Link } from "next-view-transitions";
import type { DashboardData } from "@/types";

/**
 * Deterministic daily quote picker — same quote all day, changes at midnight.
 * Uses date-based seed to ensure consistency across page reloads.
 */
function pickDailyQuote(
  quotes: DashboardData["quotes"]
): DashboardData["quotes"][number] | null {
  if (quotes.length === 0) return null;
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % quotes.length;
  return quotes[index];
}

export function DailyQuote({
  quotes,
}: {
  quotes: DashboardData["quotes"];
}) {
  const quote = pickDailyQuote(quotes);
  if (!quote) return null;

  return (
    <div>
      <p className="section-label mb-3">DAILY QUOTE</p>
      <Link href="/library" className="block group">
        <blockquote className="text-sm italic text-muted-foreground leading-relaxed">
          &ldquo;{quote.text}&rdquo;
        </blockquote>
        {quote.source && (
          <cite className="text-xs text-muted-foreground/70 not-italic mt-1 block group-hover:text-muted-foreground transition-colors">
            — {quote.source}
          </cite>
        )}
      </Link>
    </div>
  );
}
