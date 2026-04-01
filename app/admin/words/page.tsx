import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { getCategoryOptions, getAdminWords } from "@/lib/queries";
import { WordDeleteButton } from "@/components/admin/word-delete-button";

type AdminWordsPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
  }>;
};

export default async function AdminWordsPage({ searchParams }: AdminWordsPageProps) {
  const { q = "", category = "" } = await searchParams;
  const [words, categories] = await Promise.all([getAdminWords(q, category), getCategoryOptions()]);
  const selectedCategory = categories.find((item) => item.id === category) ?? null;
  const hasFilters = q.trim().length > 0 || category.trim().length > 0;

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <form action="/admin/words" className="flex-1">
            <p className="section-label">Search words</p>
            <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
              <input
                name="q"
                defaultValue={q}
                className="app-input"
                placeholder="Search by lemma, gloss, slug, or part of speech"
              />
              <select name="category" defaultValue={category} className="app-input">
                <option value="">All themes</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="tap-button-primary">
                Apply filters
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="chip">{words.length} matching words</span>
              {selectedCategory ? <span className="chip">Theme: {selectedCategory.name}</span> : null}
            </div>
            {selectedCategory ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Showing only words linked to <span className="font-semibold text-slate-900">{selectedCategory.name}</span>.
                Use the edit action on any word to clean up theme assignments by hand.
              </p>
            ) : null}
          </form>
          <div className="flex flex-wrap gap-2">
            {hasFilters ? (
              <Link href="/admin/words" className="tap-button-secondary">
                Clear filters
              </Link>
            ) : null}
            <Link href="/admin/words/new" className="tap-button-primary">
              Add new word
            </Link>
          </div>
        </div>
      </section>

      {words.length > 0 ? (
        <div className="space-y-3">
          {words.map((word) => (
            <div key={word.id} className="surface-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-xl text-slate-900">{word.lemma}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{word.plainEnglish}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {word.partOfSpeech} · {word.slug}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {word.categories.map((entry) => (
                      <span key={entry.categoryId} className="chip">
                        {entry.category.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/words/${word.id}/edit`} className="tap-button-secondary">
                    Edit
                  </Link>
                  <Link href={`/word/${word.slug}`} className="tap-button-secondary">
                    View public page
                  </Link>
                  <WordDeleteButton wordId={word.id} lemma={word.lemma} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={selectedCategory ? "No words in this theme yet" : hasFilters ? "No matching words found" : "No words yet"}
          description={
            selectedCategory
              ? `No words are currently linked to the ${selectedCategory.name} theme.`
              : hasFilters
                ? "Try a different search or clear the current filters."
                : "Add a word to start building the vocabulary explorer."
          }
          action={
            hasFilters ? (
              <Link href="/admin/words" className="tap-button-secondary">
                Clear filters
              </Link>
            ) : (
              <Link href="/admin/words/new" className="tap-button-primary">
                Add new word
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
