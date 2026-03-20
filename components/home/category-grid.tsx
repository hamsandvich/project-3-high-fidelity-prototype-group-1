import Link from "next/link";
import { ArrowUpRight, Shuffle } from "lucide-react";

import type { HomeCategoryModel } from "@/types/view-models";

type CategoryGridProps = {
  categories: HomeCategoryModel[];
  randomWordSlug?: string | null;
};

export function CategoryGrid({ categories, randomWordSlug }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/category/${category.slug}`}
          className="surface-card flex min-h-32 flex-col justify-between p-4 transition hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="section-label">Theme</p>
              <h2 className="mt-2 text-lg leading-snug text-slate-900">{category.name}</h2>
            </div>
            <ArrowUpRight className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-slate-500">
              {category._count.words} {category._count.words === 1 ? "word" : "words"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {category.words.slice(0, 2).map((item) => (
                <span key={item.word.id} className="chip">
                  {item.word.lemma}
                </span>
              ))}
            </div>
          </div>
        </Link>
      ))}
      <Link
        href={randomWordSlug ? `/word/${randomWordSlug}` : "/search"}
        className="surface-card col-span-2 flex min-h-24 items-center justify-between gap-4 bg-moss-700/95 p-4 text-white transition hover:-translate-y-0.5"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Feeling lucky</p>
          <h2 className="mt-2 text-lg">Open a random connected word</h2>
        </div>
        <Shuffle className="h-5 w-5" />
      </Link>
    </div>
  );
}
