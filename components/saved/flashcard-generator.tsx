"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, RotateCcw, Lightbulb, BookOpen, MessageCircle } from "lucide-react";

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

/* ------------------------------------------------------------------ */
/*  Deck animation variants                                           */
/* ------------------------------------------------------------------ */

const cardSwipe = {
  enter: (dir: number) => ({
    x: dir > 0 ? 260 : -260,
    opacity: 0,
    scale: 0.92,
    rotateZ: dir > 0 ? 8 : -8,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    rotateZ: 0,
    transition: { type: "spring" as const, stiffness: 340, damping: 32 },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -260 : 260,
    opacity: 0,
    scale: 0.88,
    rotateZ: dir > 0 ? -6 : 6,
    transition: { duration: 0.28, ease: "easeIn" as const },
  }),
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function FlashcardGenerator({ wordIds }: FlashcardGeneratorProps) {
  const [deck, setDeck] = useState<FlashcardDeckResponse["deck"] | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState(1); // 1 = next, -1 = prev

  const currentCard = deck?.cards[currentIndex] ?? null;
  const total = deck?.cards.length ?? 0;

  const goTo = useCallback(
    (dir: 1 | -1) => {
      if (!deck) return;
      const next = currentIndex + dir;
      if (next < 0 || next >= deck.cards.length) return;
      setDirection(dir);
      setIsFlipped(false);
      // Small delay so the flip resets before the card swaps
      setTimeout(() => setCurrentIndex(next), 60);
    },
    [deck, currentIndex]
  );

  async function handleGenerate() {
    setError("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/study/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordIds }),
      });

      const payload = (await response.json().catch(() => null)) as
        | FlashcardDeckResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload
            ? (payload.error ?? "Unable to generate flashcards.")
            : "Unable to generate flashcards."
        );
      }

      const deckPayload = payload as FlashcardDeckResponse;
      setDeck(deckPayload.deck);
      setUsedFallback(deckPayload.usedFallback);
      setCurrentIndex(0);
      setIsFlipped(false);
      setDirection(1);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to generate flashcards."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  /* ---- Generate prompt (no deck yet) ---- */
  if (!deck) {
    return (
      <section className="surface-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label">Study tool</p>
            <h2 className="mt-2 text-xl text-slate-900">AI flashcards</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Turn your saved words into a quick study deck with hints and
              practice prompts.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="tap-button-primary shrink-0"
            disabled={isGenerating}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isGenerating ? "Building..." : "Generate deck"}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-sm leading-6 text-rose-700">{error}</p>
        ) : null}
      </section>
    );
  }

  /* ---- Deck view ---- */
  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="surface-card px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="section-label">Study deck</p>
            <h2 className="mt-1.5 truncate text-lg font-semibold text-slate-900">
              {deck.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="tap-button-secondary shrink-0 text-xs"
            disabled={isGenerating}
          >
            <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
            {isGenerating ? "..." : "New deck"}
          </button>
        </div>

        {usedFallback ? (
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
            Basic deck mode
          </p>
        ) : null}

        {deck.studyTip ? (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {deck.studyTip}
          </p>
        ) : null}
      </div>

      {/* Card area */}
      <div className="relative mx-auto w-full" style={{ perspective: "1200px" }}>
        {/* Stacked card shadows (deck illusion) */}
        {total > 1 ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-3 top-2 h-full rounded-4xl border border-white/50 bg-white/40"
              style={{ transform: "translateZ(-20px)" }}
            />
            {total > 2 ? (
              <div
                className="pointer-events-none absolute inset-x-5 top-3.5 h-full rounded-4xl border border-white/30 bg-white/25"
                style={{ transform: "translateZ(-40px)" }}
              />
            ) : null}
          </>
        ) : null}

        {/* Animated card */}
        <AnimatePresence mode="popLayout" custom={direction}>
          {currentCard ? (
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={cardSwipe}
              initial="enter"
              animate="center"
              exit="exit"
              className="relative w-full"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* 3D flip wrapper */}
              <motion.div
                className="relative w-full cursor-pointer"
                style={{ transformStyle: "preserve-3d" }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => setIsFlipped((f) => !f)}
              >
                {/* ---- FRONT face ---- */}
                <div
                  className="surface-card relative w-full overflow-hidden p-6"
                  style={{
                    backfaceVisibility: "hidden",
                    minHeight: "280px",
                  }}
                >
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
                    <p className="section-label mb-4 text-moss-500">Front</p>
                    <p className="whitespace-pre-line font-display text-3xl leading-snug text-slate-900">
                      {currentCard.front}
                    </p>
                    <p className="mt-6 text-xs text-slate-400">
                      Tap card to flip
                    </p>
                  </div>

                  {/* Decorative corner accent */}
                  <div className="pointer-events-none absolute right-4 top-4 h-8 w-8 rounded-full bg-moss-50/80" />
                  <div className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 rounded-full bg-clay-50/80" />
                </div>

                {/* ---- BACK face ---- */}
                <div
                  className="surface-card absolute inset-0 w-full overflow-hidden p-6"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    minHeight: "280px",
                  }}
                >
                  <div className="flex min-h-[240px] flex-col justify-center">
                    <p className="section-label mb-3 text-center text-clay-500">
                      Back
                    </p>

                    {/* Answer */}
                    <div className="mb-4 rounded-2xl bg-moss-50/60 p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5 text-moss-500" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-moss-700">
                          Answer
                        </p>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-800">
                        {currentCard.back}
                      </p>
                    </div>

                    {/* Hint */}
                    <div className="mb-4 rounded-2xl bg-clay-50/60 p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5 text-clay-500" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay-500">
                          Hint
                        </p>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">
                        {currentCard.hint}
                      </p>
                    </div>

                    {/* Practice */}
                    <div className="rounded-2xl bg-lake-50/60 p-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5 text-lake-500" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lake-500">
                          Practice
                        </p>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">
                        {currentCard.practicePrompt}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-center text-xs text-slate-400">
                    Tap card to flip back
                  </p>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => goTo(-1)}
          disabled={currentIndex === 0}
          className="tap-button-secondary h-12 w-12 !rounded-full !p-0 disabled:opacity-30"
          aria-label="Previous card"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center gap-1">
          {deck.cards.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setDirection(i > currentIndex ? 1 : -1);
                setIsFlipped(false);
                setTimeout(() => setCurrentIndex(i), 60);
              }}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? "w-6 bg-moss-500"
                  : "w-2 bg-slate-300 hover:bg-slate-400"
              }`}
              aria-label={`Go to card ${i + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(1)}
          disabled={currentIndex >= total - 1}
          className="tap-button-secondary h-12 w-12 !rounded-full !p-0 disabled:opacity-30"
          aria-label="Next card"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Card counter */}
      <p className="text-center text-xs font-medium text-slate-400">
        {currentIndex + 1} of {total}
      </p>

      {error ? (
        <p className="px-1 text-sm leading-6 text-rose-700">{error}</p>
      ) : null}
    </section>
  );
}
