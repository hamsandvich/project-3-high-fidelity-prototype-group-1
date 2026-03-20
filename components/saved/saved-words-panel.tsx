"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";

import { useAppState } from "@/components/providers/app-providers";
import { FlashcardGenerator } from "@/components/saved/flashcard-generator";
import { EmptyState } from "@/components/ui/empty-state";

export function SavedWordsPanel() {
  const { savedWords, removeSavedWord } = useAppState();

  if (!savedWords.length) {
    return (
      <EmptyState
        title="No saved words yet"
        description="Bookmark a word from its detail page and it will appear here for quick return visits."
      />
    );
  }

  return (
    <div className="space-y-3">
      <FlashcardGenerator wordIds={savedWords.map((word) => word.id)} />
      {savedWords.map((word) => (
        <div key={word.id} className="surface-card flex items-center justify-between gap-3 p-4">
          <Link href={`/word/${word.slug}`} className="min-w-0 flex-1">
            <p className="text-lg text-slate-900">{word.lemma}</p>
            {word.syllabics ? <p className="mt-1 text-sm text-slate-500">{word.syllabics}</p> : null}
            <p className="mt-2 text-sm font-medium text-slate-700">{word.plainEnglish}</p>
          </Link>
          <button
            type="button"
            onClick={() => removeSavedWord(word.id)}
            className="tap-button-secondary shrink-0 px-3"
            aria-label={`Remove ${word.lemma} from saved words`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
