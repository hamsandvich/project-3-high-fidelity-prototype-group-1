import Link from "next/link";

import { PageFrame } from "@/components/navigation/page-frame";
import { ItwewinaSearchFallback } from "@/components/search/itwewina-search-fallback";
import { SearchBar } from "@/components/search/search-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { WordCard } from "@/components/ui/word-card";
import { searchWords } from "@/lib/queries";
import type { WordCardModel } from "@/types/view-models";

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;
  const results = await searchWords(q);

  return (
    <PageFrame
      title="Search"
      subtitle="Find words by Cree lemma, syllabics, English gloss, or a partial match."
      backHref="/"
    >
      <div className="space-y-4">
        <SearchBar initialQuery={q} />

        {!q.trim() ? (
          <EmptyState
            title="Try a search"
            description="Search for a Cree word like miskîsik or an English gloss like eye."
          />
        ) : results.length === 0 ? (
          <EmptyState
            title="No local matches yet"
            description="Try another spelling, or let the app check Itwewina and save matching words to the database."
            action={
              <div className="space-y-3">
                <ItwewinaSearchFallback query={q} />
                <Link href="/" className="tap-button-primary inline-flex">
                  Browse categories
                </Link>
              </div>
            }
          />
        ) : (
          <div className="space-y-3">
            {results.map((word) => (
              <WordCard key={word.id} word={word as WordCardModel} />
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
