"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type WordDemoToggleButtonProps = {
  wordId: string;
  lemma: string;
  isDemo: boolean;
};

export function WordDemoToggleButton({ wordId, lemma, isDemo }: WordDemoToggleButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className="tap-button-secondary"
      disabled={isPending}
      onClick={() => {
        const nextIsDemo = !isDemo;
        const actionLabel = nextIsDemo ? "mark as demo" : "remove the demo flag from";

        if (!window.confirm(`Do you want to ${actionLabel} "${lemma}"?`)) {
          return;
        }

        startTransition(async () => {
          await fetch(`/api/admin/words/${wordId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ isDemo: nextIsDemo })
          });
          router.refresh();
        });
      }}
    >
      {isPending ? "Saving..." : isDemo ? "Clear demo flag" : "Mark as demo"}
    </button>
  );
}
