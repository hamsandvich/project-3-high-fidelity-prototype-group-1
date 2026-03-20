"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type ItwewinaSearchFallbackProps = {
  query: string;
};

type FallbackState =
  | {
      tone: "loading";
      message: string;
    }
  | {
      tone: "error";
      message: string;
    };

export function ItwewinaSearchFallback({ query }: ItwewinaSearchFallbackProps) {
  const router = useRouter();
  const requestedRef = useRef(false);
  const [state, setState] = useState<FallbackState>({
    tone: "loading",
    message: `No local match for "${query.trim()}". Checking Itwewina and saving anything we find.`
  });

  useEffect(() => {
    const normalized = query.trim();

    if (!normalized || requestedRef.current) {
      return;
    }

    requestedRef.current = true;

    const controller = new AbortController();

    setState({
      tone: "loading",
      message: `No local match for "${normalized}". Checking Itwewina and saving anything we find.`
    });

    void (async () => {
      try {
        const response = await fetch("/api/search/itwewina", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query: normalized }),
          signal: controller.signal
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              status?: "existing" | "imported" | "not_found";
              importedCount?: number;
              error?: string;
            }
          | null;

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          setState({
            tone: "error",
            message: payload?.error ?? `No importable Itwewina matches were found for "${normalized}".`
          });
          return;
        }

        const importedCount = payload?.importedCount ?? 0;
        setState({
          tone: "loading",
          message:
            payload?.status === "existing"
              ? "A matching word is already available locally. Refreshing your search."
              : `Saved ${importedCount} Itwewina match${importedCount === 1 ? "" : "es"} to the database. Refreshing your search.`
        });

        startTransition(() => {
          router.refresh();
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          tone: "error",
          message: error instanceof Error ? error.message : "Unable to search Itwewina right now."
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [query, router]);

  const isLoading = state.tone === "loading";

  return (
    <div
      className={`rounded-3xl border px-4 py-3 text-left ${
        isLoading ? "border-amber-200 bg-amber-50/80 text-amber-950" : "border-rose-200 bg-rose-50/80 text-rose-950"
      }`}
    >
      <div className="flex items-start gap-3">
        {isLoading ? (
          <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p className="text-sm leading-6">{state.message}</p>
      </div>
    </div>
  );
}
