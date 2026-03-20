import Link from "next/link";

import { WordDeleteButton } from "@/components/admin/word-delete-button";
import { getAdminWords } from "@/lib/queries";

type AdminWordsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function AdminWordsPage({ searchParams }: AdminWordsPageProps) {
  const { q = "" } = await searchParams;
  const words = await getAdminWords(q);

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <form action="/admin/words" className="flex-1">
            <p className="section-label">Search words</p>
            <div className="mt-2 flex flex-col gap-2 md:flex-row">
              <input
                name="q"
                defaultValue={q}
                className="app-input"
                placeholder="Search by lemma, gloss, slug, or part of speech"
              />
              <button type="submit" className="tap-button-primary">
                Search
              </button>
            </div>
          </form>
          <Link href="/admin/words/new" className="tap-button-primary">
            Add new word
          </Link>
        </div>
      </section>

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
                  {word.categories.map((category) => (
                    <span key={category.categoryId} className="chip">
                      {category.category.name}
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
    </div>
  );
}
