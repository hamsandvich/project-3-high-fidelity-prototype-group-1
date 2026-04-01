"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import type { CategoryOption, ThemeWordBulkEditInput } from "@/types";

type ThemeWordBulkEditorRow = ThemeWordBulkEditInput & {
  slug: string;
  categories: Array<{
    id: string;
    name: string;
  }>;
};

type ThemeWordBulkEditorProps = {
  category: CategoryOption;
  initialWords: ThemeWordBulkEditorRow[];
};

function rowsMatch(left: ThemeWordBulkEditorRow, right: ThemeWordBulkEditorRow) {
  return (
    left.lemma === right.lemma &&
    (left.syllabics ?? "") === (right.syllabics ?? "") &&
    left.plainEnglish === right.plainEnglish &&
    left.partOfSpeech === right.partOfSpeech &&
    left.keepInTheme === right.keepInTheme &&
    left.themeSortOrder === right.themeSortOrder
  );
}

export function ThemeWordBulkEditor({ category, initialWords }: ThemeWordBulkEditorProps) {
  const [rows, setRows] = useState(initialWords);
  const [baselineRows, setBaselineRows] = useState(initialWords);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const changedRows = rows.filter((row, index) => !rowsMatch(row, baselineRows[index]));

  const updateRow = (wordId: string, patch: Partial<ThemeWordBulkEditorRow>) => {
    setRows((current) => current.map((row) => (row.id === wordId ? { ...row, ...patch } : row)));
  };

  return (
    <section className="surface-card p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="section-label">Bulk edit theme words</p>
          <h2 className="mt-2 text-xl text-slate-900">Clean up {category.name} without opening each word</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Edit the key fields inline, adjust the theme order, or remove words from this theme in one pass.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{rows.length} loaded</span>
          <span className="chip">{changedRows.length} unsaved</span>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {successMessage ? <p className="mt-4 text-sm text-moss-700">{successMessage}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="tap-button-primary"
          disabled={isPending || changedRows.length === 0}
          onClick={() => {
            setError("");
            setSuccessMessage("");

            startTransition(async () => {
              const response = await fetch("/api/admin/words/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  categoryId: category.id,
                  words: changedRows.map((row) => ({
                    id: row.id,
                    lemma: row.lemma,
                    syllabics: row.syllabics ?? "",
                    plainEnglish: row.plainEnglish,
                    partOfSpeech: row.partOfSpeech,
                    keepInTheme: row.keepInTheme,
                    themeSortOrder: row.themeSortOrder
                  }))
                })
              });

              if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                setError(payload?.error ?? "Unable to save bulk edits.");
                return;
              }

              setBaselineRows(rows);
              setSuccessMessage(`${changedRows.length} word${changedRows.length === 1 ? "" : "s"} updated.`);
              router.refresh();
            });
          }}
        >
          <Save className="mr-2 h-4 w-4" />
          Save all changes
        </button>
        <button
          type="button"
          className="tap-button-secondary"
          disabled={isPending || changedRows.length === 0}
          onClick={() => {
            setRows(baselineRows);
            setError("");
            setSuccessMessage("");
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset unsaved changes
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map((row, index) => {
          const hasChanges = !rowsMatch(row, baselineRows[index]);
          const otherCategories = row.categories.filter((entry) => entry.id !== category.id);

          return (
            <div
              key={row.id}
              className={cn(
                "rounded-3xl border border-slate-200 bg-slate-50 p-4",
                !row.keepInTheme ? "border-amber-300 bg-amber-50/70" : ""
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-slate-900">{row.lemma || "Untitled word"}</p>
                    {hasChanges ? <span className="chip">Unsaved</span> : null}
                    {!row.keepInTheme ? <span className="chip">Will be removed from theme</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{row.slug}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={row.keepInTheme ? "tap-button-secondary" : "tap-button-primary"}
                    disabled={isPending}
                    onClick={() => updateRow(row.id, { keepInTheme: !row.keepInTheme })}
                  >
                    {row.keepInTheme ? "Remove from theme" : "Keep in theme"}
                  </button>
                  <Link href={`/admin/words/${row.id}/edit`} className="tap-button-secondary">
                    Full edit
                  </Link>
                  <Link href={`/word/${row.slug}`} className="tap-button-secondary">
                    View public page
                  </Link>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[8rem_1fr_1fr]">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Theme order</span>
                  <input
                    type="number"
                    min={0}
                    value={row.themeSortOrder}
                    disabled={isPending || !row.keepInTheme}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      updateRow(row.id, { themeSortOrder: Number.isNaN(value) ? 0 : Math.max(0, value) });
                    }}
                    className="app-input"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lemma</span>
                  <input
                    value={row.lemma}
                    disabled={isPending}
                    onChange={(event) => updateRow(row.id, { lemma: event.target.value })}
                    className="app-input"
                    placeholder="Cree lemma"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Syllabics</span>
                  <input
                    value={row.syllabics ?? ""}
                    disabled={isPending}
                    onChange={(event) => updateRow(row.id, { syllabics: event.target.value })}
                    className="app-input"
                    placeholder="Optional syllabics"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plain English</span>
                  <input
                    value={row.plainEnglish}
                    disabled={isPending}
                    onChange={(event) => updateRow(row.id, { plainEnglish: event.target.value })}
                    className="app-input"
                    placeholder="English gloss"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Part of speech</span>
                  <input
                    value={row.partOfSpeech}
                    disabled={isPending}
                    onChange={(event) => updateRow(row.id, { partOfSpeech: event.target.value })}
                    className="app-input"
                    placeholder="Part of speech"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Other themes:</span>
                {otherCategories.length > 0 ? (
                  otherCategories.map((entry) => (
                    <span key={`${row.id}-${entry.id}`} className="chip">
                      {entry.name}
                    </span>
                  ))
                ) : (
                  <span>None</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
