import { CategoryGrid } from "@/components/home/category-grid";
import { PageFrame } from "@/components/navigation/page-frame";
import { SearchBar } from "@/components/search/search-bar";
import { getHomePageData } from "@/lib/queries";
import type { HomeCategoryModel } from "@/types/view-models";

export default async function HomePage() {
  const data = await getHomePageData();

  return (
    <PageFrame
      title="Vocabulary Explorer"
      subtitle="Explore Plains Cree vocabulary by theme, relation, and learner level."
    >
      <section className="surface-card p-5">
        <p className="section-label">Search</p>
        <h2 className="mt-2 text-2xl text-slate-900">Start with a Cree or English word</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Search by lemma, gloss, or partial match to jump straight into a word detail card.
        </p>
        <div className="mt-4">
          <SearchBar />
        </div>
      </section>

      <section className="mt-4">
        <CategoryGrid categories={data.categories as HomeCategoryModel[]} randomWordSlug={data.randomWordSlug} />
      </section>
    </PageFrame>
  );
}
