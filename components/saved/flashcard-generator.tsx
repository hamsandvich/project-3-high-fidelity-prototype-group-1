"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Sparkles } from "lucide-react";

type FlashcardGeneratorProps = {
  wordIds: string[];
};

type Flashcard = {
  wordId: string;
  front: string;
  back: string;
  hint: string;
  practicePrompt: string;
};

type FlashcardDeckResponse = {
  deck: {
    title: string;
    studyTip: string;
    cards: Flashcard[];
  };
  usedFallback: boolean;
};

export function FlashcardGenerator({ wordIds }: FlashcardGeneratorProps) {
  const [deck, setDeck] = useState<FlashcardDeckResponse["deck"] | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const currentCard = deck?.cards[currentIndex] ?? null;

  async function handleGenerate() {
    setError("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/study/flashcards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ wordIds })
      });

      const payload = (await response.json().catch(() => null)) as
        | FlashcardDeckResponse
        | {
            error?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload && "error" in payload ? payload.error ?? "Unable to generate flashcards." : "Unable to generate flashcards.");
      }

      const deckPayload = payload as FlashcardDeckResponse;

      setDeck(deckPayload.deck);
      setUsedFallback(deckPayload.usedFallback);
      setCurrentIndex(0);
      setShowAnswer(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate flashcards.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Study tool</p>
          <h2 className="mt-2 text-xl text-slate-900">AI flashcards</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Turn your saved words into a quick study deck with hints and practice prompts.
          </p>
        </div>
        <button type="button" onClick={handleGenerate} className="tap-button-secondary shrink-0" disabled={isGenerating}>
          <Sparkles className="mr-2 h-4 w-4" />
          {isGenerating ? "Building..." : deck ? "Refresh deck" : "Generate deck"}
        </button>
      </div>

      {deck ? (
        <div className="mt-4 space-y-4">
          <div className="surface-muted p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">{deck.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{deck.studyTip}</p>
              </div>
              <span className="chip">
                {currentIndex + 1} / {deck.cards.length}
              </span>
            </div>

            {usedFallback ? (
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
                Basic deck mode
              </p>
            ) : null}

            {currentCard ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-white/95 p-5">
                <p className="section-label">Front</p>
                <p className="mt-3 whitespace-pre-line text-2xl leading-tight text-slate-900">{currentCard.front}</p>

                {showAnswer ? (
                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                    <div>
                      <p className="section-label">Back</p>
                      <p className="mt-2 text-sm leading-7 text-slate-700">{currentCard.back}</p>
                    </div>
                    <div>
                      <p className="section-label">Hint</p>
                      <p className="mt-2 text-sm leading-7 text-slate-700">{currentCard.hint}</p>
                    </div>
                    <div>
                      <p className="section-label">Practice</p>
                      <p className="mt-2 text-sm leading-7 text-slate-700">{currentCard.practicePrompt}</p>
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowAnswer((current) => !current)}
                  className="tap-button-primary mt-5 w-full"
                >
                  {showAnswer ? "Hide answer" : "Show answer"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setCurrentIndex((current) => Math.max(current - 1, 0));
                setShowAnswer(false);
              }}
              className="tap-button-secondary"
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setShowAnswer(false)}
              className="tap-button-secondary"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentIndex((current) => Math.min(current + 1, Math.max((deck?.cards.length ?? 1) - 1, 0)));
                setShowAnswer(false);
              }}
              className="tap-button-secondary"
              disabled={currentIndex >= (deck?.cards.length ?? 1) - 1}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm leading-6 text-rose-700">{error}</p> : null}
    </section>
  );
}
