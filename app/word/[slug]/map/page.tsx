import { notFound } from "next/navigation";

import { PageFrame } from "@/components/navigation/page-frame";
import { SemanticMap } from "@/components/word/semantic-map";
import { EmptyState } from "@/components/ui/empty-state";
import { getWordBySlug } from "@/lib/queries";
import type { WordDetailModel } from "@/types/view-models";

type MapPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function MapPage({ params }: MapPageProps) {
  const { slug } = await params;
  const word = await getWordBySlug(slug);

  if (!word) {
    notFound();
  }

  return (
    <PageFrame
      title={`${word.lemma} map`}
      subtitle="A simple semantic snapshot of directly connected words."
      backHref={`/word/${word.slug}`}
    >
      {word.relatedWords.length ? (
        <SemanticMap centerWord={word as WordDetailModel} relatedWords={word.relatedWords} />
      ) : (
        <EmptyState
          title="No connections yet"
          description="This word does not have any related entries yet, so the map is empty."
        />
      )}
    </PageFrame>
  );
}
