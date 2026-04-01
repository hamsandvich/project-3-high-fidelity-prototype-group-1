"use client";

import Link from "next/link";

import { useAppState } from "@/components/providers/app-providers";
import { cn } from "@/lib/utils";
import type { RelatedWordModel, WordCardModel } from "@/types/view-models";

type SemanticMapProps = {
  centerWord: WordCardModel;
  relatedWords: RelatedWordModel[];
  framed?: boolean;
};

export function SemanticMap({ centerWord, relatedWords, framed = true }: SemanticMapProps) {
  const { preferences } = useAppState();
  const nodes = relatedWords.slice(0, 8);
  const radius = 37;
  const center = 50;

  return (
    <div className={cn(framed ? "surface-card p-4" : "space-y-4")}>
      <div className="relative aspect-square rounded-4xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
          {nodes.map((node, index) => {
            const angle = ((Math.PI * 2) / Math.max(nodes.length, 1)) * index - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);

            return (
              <line
                key={node.id}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="rgba(79, 123, 91, 0.28)"
                strokeWidth="0.6"
              />
            );
          })}
        </svg>

        <div className="absolute left-1/2 top-1/2 z-20 w-[8.5rem] max-w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-moss-700 px-4 py-3 text-center text-white shadow-card sm:w-40">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-white/70">Selected word</p>
          <p className="mt-2 text-lg">{centerWord.lemma}</p>
          {preferences.showSyllabics && centerWord.syllabics ? (
            <p className="mt-1 text-xs text-white/75">{centerWord.syllabics}</p>
          ) : null}
          <p className="mt-2 text-sm text-white/85">{centerWord.plainEnglish}</p>
        </div>

        {nodes.map((node, index) => {
          const angle = ((Math.PI * 2) / Math.max(nodes.length, 1)) * index - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);

          return (
            <Link
              key={node.id}
              href={`/word/${node.word.slug}`}
              className="absolute z-30 w-24 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-200 bg-white/95 px-2.5 py-2 text-center text-xs shadow-sm transition hover:border-moss-200 hover:text-moss-900 sm:w-28"
              style={{
                left: `${x}%`,
                top: `${y}%`
              }}
            >
              <p className="font-semibold text-slate-900">{node.word.lemma}</p>
              <p className="mt-1 text-[0.72rem] text-slate-500">{node.word.plainEnglish}</p>
            </Link>
          );
        })}
      </div>
      <div className={cn("space-y-2", framed ? "mt-4" : "")}>
        <p className="section-label">Connection legend</p>
        <div className="flex flex-wrap gap-2">
          {nodes.map((node) => (
            <span key={`${node.id}-legend`} className="chip">
              {node.word.lemma} · {node.relationType}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
