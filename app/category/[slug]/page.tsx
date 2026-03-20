import { ThemeLessonGenerator } from "@/components/category/theme-lesson-generator";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/navigation/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { WordCard } from "@/components/ui/word-card";
import { getCategoryBySlug } from "@/lib/queries";
import type { WordCardModel } from "@/types/view-models";

type CategoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  return (
    <PageFrame
      title={category.name}
      subtitle={category.description ?? "Browse the words in this theme."}
      backHref="/"
    >
      {category.words.length ? (
        <div className="space-y-4">
          <ThemeLessonGenerator categorySlug={category.slug} categoryName={category.name} />
          {category.words.map((entry) => (
            <WordCard key={entry.word.id} word={entry.word as WordCardModel} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No words yet"
          description="This theme is ready for real vocabulary as soon as you add or import it."
        />
      )}
    </PageFrame>
  );
}
