"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, RotateCcw, Lightbulb, BookOpen, MessageCircle, RefreshCw } from "lucide-react";

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
    x: dir > 0 ? 300 : -300,
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
    x: dir > 0 ? -300 : 300,
    opacity: 0,
    scale: 0.88,
    rotateZ: dir > 0 ? -6 : 6,
    transition: { duration: 0.25, ease: "easeIn" as const },
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
  const [direction, setDirection] = useState(1);

  // Track measured card height so container doesn't collapse during transitions
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(320);

  const currentCard = deck?.cards[currentIndex] ?? null;
  const total = deck?.cards.length ?? 0;

  // Measure card content and update container height
  useEffect(() => {
    const measure = () => {
      const activeRef = isFlipped ? backRef : frontRef;
      if (activeRef.current) {
        const h = activeRef.current.scrollHeight;
        setCardHeight(Math.max(h, 280));
      }
    };
    measure();
    // Re-measure after flip animation completes
    const timeout = setTimeout(measure, 550);
    return () => clearTimeout(timeout);
  }, [isFlipped, currentIndex]);

  const goTo = useCallback(
    (dir: 1 | -1) => {
      if (!deck) return;
      const next = currentIndex + dir;
      if (next < 0 || next >= deck.cards.length) return;
      setDirection(dir);
      setIsFlipped(false);
      setCurrentIndex(next);
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

      {/* Card area — fixed height container prevents layout shift */}
      <div
        className="relative mx-auto w-full overflow-hidden"
        style={{ height: cardHeight, perspective: "1200px" }}
      >
        {/* Stacked card shadows (deck illusion) */}
        {total > 1 ? (
          <>
            <div className="pointer-events-none absolute inset-x-3 bottom-0 top-2 rounded-4xl border border-white/50 bg-white/40" />
            {total > 2 ? (
              <div className="pointer-events-none absolute inset-x-5 bottom-0 top-3.5 rounded-4xl border border-white/30 bg-white/25" />
            ) : null}
          </>
        ) : null}

        {/* Animated card */}
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          {currentCard ? (
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={cardSwipe}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              {/* 3D flip wrapper */}
              <div
                className="relative h-full w-full"
                style={{
                  transformStyle: "preserve-3d",
                  transition: "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* ---- FRONT face ---- */}
                <div
                  ref={frontRef}
                  className="surface-card absolute inset-0 flex flex-col items-center justify-center p-6"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <p className="section-label mb-5 text-moss-500">Front</p>
                  <p className="whitespace-pre-line text-center font-display text-3xl leading-snug text-slate-900">
                    {currentCard.front}
                  </p>

                  {/* Flip button */}
                  <button
                    type="button"
                    onClick={() => setIsFlipped(true)}
                    className="tap-button-primary mt-8"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Show answer
                  </button>

                  {/* Decorative accents */}
                  <div className="pointer-events-none absolute right-4 top-4 h-8 w-8 rounded-full bg-moss-50/80" />
                  <div className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 rounded-full bg-clay-50/80" />
                </div>

                {/* ---- BACK face ---- */}
                <div
                  ref={backRef}
                  className="surface-card absolute inset-0 overflow-y-auto p-5"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <p className="section-label mb-4 text-center text-clay-500">
                    Back
                  </p>

                  {/* Answer */}
                  <div className="mb-3 rounded-2xl bg-moss-50/60 p-4">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-moss-500" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-moss-700">
                        Answer
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-800">
                      {currentCard.back}
                    </p>
                  </div>

                  {/* Hint */}
                  <div className="mb-3 rounded-2xl bg-clay-50/60 p-4">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-clay-500" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay-500">
                        Hint
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">
                      {currentCard.hint}
                    </p>
                  </div>

                  {/* Practice */}
                  <div className="mb-4 rounded-2xl bg-lake-50/60 p-4">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-lake-500" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lake-500">
                        Practice
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">
                      {currentCard.practicePrompt}
                    </p>
                  </div>

                  {/* Flip back button */}
                  <button
                    type="button"
                    onClick={() => setIsFlipped(false)}
                    className="tap-button-secondary w-full"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Flip back
                  </button>
                </div>
              </div>
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
        <div className="flex items-center gap-1.5">
          {deck.cards.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setDirection(i > currentIndex ? 1 : -1);
                setIsFlipped(false);
                setCurrentIndex(i);
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
