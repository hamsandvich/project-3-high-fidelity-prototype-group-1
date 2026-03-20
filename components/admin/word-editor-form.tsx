"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { RELATION_TYPE_HELPERS, RELATION_TYPE_LABELS, RELATION_TYPE_VALUES } from "@/lib/constants";
import { slugify } from "@/lib/utils";
import type { CategoryOption, RelationTypeValue, WordFormPayload, WordOption } from "@/types";

type WordEditorFormProps = {
  mode: "create" | "edit";
  initialPayload: WordFormPayload;
  categories: CategoryOption[];
  wordOptions: WordOption[];
};

function defaultBidirectional(type: RelationTypeValue) {
  return ["synonym", "antonym", "associated", "variant", "similar", "broader"].includes(type);
}

function createMeaning() {
  return {
    gloss: "",
    description: "",
    sortOrder: 0
  };
}

function createMorphologyEntry() {
  return {
    rowLabel: "",
    columnLabel: "",
    plainLabel: "",
    value: "",
    sortOrder: 0
  };
}

function createMorphologyTable() {
  return {
    title: "",
    description: "",
    isPlainEnglish: true,
    sortOrder: 0,
    entries: [createMorphologyEntry()]
  };
}

function createRelation() {
  return {
    toWordId: "",
    relationType: "associated" as RelationTypeValue,
    label: "",
    isBidirectional: true
  };
}

export function WordEditorForm({ mode, initialPayload, categories, wordOptions }: WordEditorFormProps) {
  const [form, setForm] = useState<WordFormPayload>(initialPayload);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const deferredLemma = useDeferredValue(form.lemma);

  const slugPreview = useMemo(() => slugify(deferredLemma) || "word-entry", [deferredLemma]);
  const endpoint = mode === "create" ? "/api/admin/words" : `/api/admin/words/${form.id}`;

  const updateField = <K extends keyof WordFormPayload>(key: K, value: WordFormPayload[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setSuccessMessage("");
        setIsSaving(true);

        const response = await fetch(endpoint, {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        });

        setIsSaving(false);

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(payload?.error ?? "Unable to save the word.");
          return;
        }

        const payload = (await response.json()) as { word: { id: string; slug: string } };
        setSuccessMessage(mode === "create" ? "Word created." : "Word updated.");

        startTransition(() => {
          router.push(`/admin/words/${payload.word.id}/edit`);
          router.refresh();
        });
      }}
    >
      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Core fields</p>
            <h2 className="mt-2 text-xl text-slate-900">
              {mode === "create" ? "Create a new word" : "Edit word record"}
            </h2>
          </div>
          <span className="chip">Slug preview: {slugPreview}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={form.lemma}
            onChange={(event) => updateField("lemma", event.target.value)}
            className="app-input"
            placeholder="Cree lemma (Latin script)"
          />
          <input
            value={form.syllabics ?? ""}
            onChange={(event) => updateField("syllabics", event.target.value)}
            className="app-input"
            placeholder="Syllabics form (optional)"
          />
          <input
            value={form.plainEnglish}
            onChange={(event) => updateField("plainEnglish", event.target.value)}
            className="app-input"
            placeholder="Plain English gloss"
          />
          <input
            value={form.partOfSpeech}
            onChange={(event) => updateField("partOfSpeech", event.target.value)}
            className="app-input"
            placeholder="Part of speech"
          />
          <input
            value={form.linguisticClass ?? ""}
            onChange={(event) => updateField("linguisticClass", event.target.value)}
            className="app-input"
            placeholder="Linguistic classification"
          />
          <input
            value={form.rootStem ?? ""}
            onChange={(event) => updateField("rootStem", event.target.value)}
            className="app-input"
            placeholder="Root or stem"
          />
          <input
            value={form.pronunciation ?? ""}
            onChange={(event) => updateField("pronunciation", event.target.value)}
            className="app-input"
            placeholder="Pronunciation"
          />
          <input
            value={form.audioUrl ?? ""}
            onChange={(event) => updateField("audioUrl", event.target.value)}
            className="app-input"
            placeholder="Audio URL"
          />
          <textarea
            value={form.beginnerExplanation ?? ""}
            onChange={(event) => updateField("beginnerExplanation", event.target.value)}
            className="app-input md:col-span-2"
            rows={4}
            placeholder="Beginner explanation"
          />
          <textarea
            value={form.expertExplanation ?? ""}
            onChange={(event) => updateField("expertExplanation", event.target.value)}
            className="app-input md:col-span-2"
            rows={4}
            placeholder="Expert explanation"
          />
          <textarea
            value={form.source ?? ""}
            onChange={(event) => updateField("source", event.target.value)}
            className="app-input md:col-span-2"
            rows={3}
            placeholder="Source"
          />
          <textarea
            value={form.notes ?? ""}
            onChange={(event) => updateField("notes", event.target.value)}
            className="app-input md:col-span-2"
            rows={4}
            placeholder="Notes"
          />
        </div>

      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Categories</p>
            <h2 className="mt-2 text-xl text-slate-900">Assign themes</h2>
          </div>
          <span className="chip">{form.categoryIds.length} selected</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => {
            const selected = form.categoryIds.includes(category.id);

            return (
              <button
                key={category.id}
                type="button"
                onClick={() =>
                  updateField(
                    "categoryIds",
                    selected
                      ? form.categoryIds.filter((id) => id !== category.id)
                      : [...form.categoryIds, category.id]
                  )
                }
                className={selected ? "tap-button-primary" : "tap-button-secondary"}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Additional meanings</p>
            <h2 className="mt-2 text-xl text-slate-900">Gloss list</h2>
          </div>
          <button
            type="button"
            className="tap-button-secondary"
            onClick={() => updateField("meanings", [...form.meanings, createMeaning()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add meaning
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {form.meanings.map((meaning, index) => (
            <div key={`meaning-${index}`} className="surface-muted p-4">
              <div className="grid gap-3 md:grid-cols-[1.2fr_1.8fr_auto]">
                <input
                  value={meaning.gloss}
                  onChange={(event) =>
                    updateField(
                      "meanings",
                      form.meanings.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, gloss: event.target.value, sortOrder: index } : item
                      )
                    )
                  }
                  className="app-input"
                  placeholder="Gloss"
                />
                <input
                  value={meaning.description ?? ""}
                  onChange={(event) =>
                    updateField(
                      "meanings",
                      form.meanings.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, description: event.target.value, sortOrder: index } : item
                      )
                    )
                  }
                  className="app-input"
                  placeholder="Description"
                />
                <button
                  type="button"
                  className="tap-button-secondary"
                  onClick={() =>
                    updateField(
                      "meanings",
                      form.meanings.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Morphology and paradigms</p>
            <h2 className="mt-2 text-xl text-slate-900">Tables and forms</h2>
          </div>
          <button
            type="button"
            className="tap-button-secondary"
            onClick={() => updateField("morphologyTables", [...form.morphologyTables, createMorphologyTable()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add table
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {form.morphologyTables.map((table, tableIndex) => (
            <div key={`table-${tableIndex}`} className="surface-muted p-4">
              <div className="grid gap-3 md:grid-cols-[1.1fr_1.4fr_auto]">
                <input
                  value={table.title}
                  onChange={(event) =>
                    updateField(
                      "morphologyTables",
                      form.morphologyTables.map((item, itemIndex) =>
                        itemIndex === tableIndex ? { ...item, title: event.target.value, sortOrder: tableIndex } : item
                      )
                    )
                  }
                  className="app-input"
                  placeholder="Table title"
                />
                <input
                  value={table.description ?? ""}
                  onChange={(event) =>
                    updateField(
                      "morphologyTables",
                      form.morphologyTables.map((item, itemIndex) =>
                        itemIndex === tableIndex
                          ? { ...item, description: event.target.value, sortOrder: tableIndex }
                          : item
                      )
                    )
                  }
                  className="app-input"
                  placeholder="Description"
                />
                <button
                  type="button"
                  className="tap-button-secondary"
                  onClick={() =>
                    updateField(
                      "morphologyTables",
                      form.morphologyTables.filter((_, itemIndex) => itemIndex !== tableIndex)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <label className="mt-3 flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={table.isPlainEnglish}
                  onChange={(event) =>
                    updateField(
                      "morphologyTables",
                      form.morphologyTables.map((item, itemIndex) =>
                        itemIndex === tableIndex
                          ? { ...item, isPlainEnglish: event.target.checked, sortOrder: tableIndex }
                          : item
                      )
                    )
                  }
                />
                Use plain-English learner labels
              </label>

              <div className="mt-4 space-y-2">
                {table.entries.map((entry, entryIndex) => (
                  <div key={`entry-${tableIndex}-${entryIndex}`} className="grid gap-2 md:grid-cols-4">
                    <input
                      value={entry.rowLabel}
                      onChange={(event) =>
                        updateField(
                          "morphologyTables",
                          form.morphologyTables.map((item, itemIndex) =>
                            itemIndex === tableIndex
                              ? {
                                  ...item,
                                  entries: item.entries.map((currentEntry, currentIndex) =>
                                    currentIndex === entryIndex
                                      ? { ...currentEntry, rowLabel: event.target.value, sortOrder: entryIndex }
                                      : currentEntry
                                  )
                                }
                              : item
                          )
                        )
                      }
                      className="app-input"
                      placeholder="Row label"
                    />
                    <input
                      value={entry.columnLabel ?? ""}
                      onChange={(event) =>
                        updateField(
                          "morphologyTables",
                          form.morphologyTables.map((item, itemIndex) =>
                            itemIndex === tableIndex
                              ? {
                                  ...item,
                                  entries: item.entries.map((currentEntry, currentIndex) =>
                                    currentIndex === entryIndex
                                      ? { ...currentEntry, columnLabel: event.target.value, sortOrder: entryIndex }
                                      : currentEntry
                                  )
                                }
                              : item
                          )
                        )
                      }
                      className="app-input"
                      placeholder="Column label"
                    />
                    <input
                      value={entry.plainLabel ?? ""}
                      onChange={(event) =>
                        updateField(
                          "morphologyTables",
                          form.morphologyTables.map((item, itemIndex) =>
                            itemIndex === tableIndex
                              ? {
                                  ...item,
                                  entries: item.entries.map((currentEntry, currentIndex) =>
                                    currentIndex === entryIndex
                                      ? { ...currentEntry, plainLabel: event.target.value, sortOrder: entryIndex }
                                      : currentEntry
                                  )
                                }
                              : item
                          )
                        )
                      }
                      className="app-input"
                      placeholder="Plain-English label"
                    />
                    <div className="flex gap-2">
                      <input
                        value={entry.value}
                        onChange={(event) =>
                          updateField(
                            "morphologyTables",
                            form.morphologyTables.map((item, itemIndex) =>
                              itemIndex === tableIndex
                                ? {
                                    ...item,
                                    entries: item.entries.map((currentEntry, currentIndex) =>
                                      currentIndex === entryIndex
                                        ? { ...currentEntry, value: event.target.value, sortOrder: entryIndex }
                                        : currentEntry
                                    )
                                  }
                                : item
                            )
                          )
                        }
                        className="app-input"
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        className="tap-button-secondary"
                        onClick={() =>
                          updateField(
                            "morphologyTables",
                            form.morphologyTables.map((item, itemIndex) =>
                              itemIndex === tableIndex
                                ? {
                                    ...item,
                                    entries: item.entries.filter((_, currentIndex) => currentIndex !== entryIndex)
                                  }
                                : item
                            )
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="tap-button-secondary mt-3"
                onClick={() =>
                  updateField(
                    "morphologyTables",
                    form.morphologyTables.map((item, itemIndex) =>
                      itemIndex === tableIndex ? { ...item, entries: [...item.entries, createMorphologyEntry()] } : item
                    )
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add row
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-label">Related words</p>
            <h2 className="mt-2 text-xl text-slate-900">Semantic and grammatical links</h2>
          </div>
          <button
            type="button"
            className="tap-button-secondary"
            onClick={() => updateField("relations", [...form.relations, createRelation()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add relation
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {form.relations.map((relation, relationIndex) => (
            <div key={`relation-${relationIndex}`} className="surface-muted p-4">
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
                <select
                  value={relation.toWordId}
                  onChange={(event) =>
                    updateField(
                      "relations",
                      form.relations.map((item, itemIndex) =>
                        itemIndex === relationIndex ? { ...item, toWordId: event.target.value } : item
                      )
                    )
                  }
                  className="app-input"
                >
                  <option value="">Choose related word</option>
                  {wordOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.lemma} · {option.plainEnglish}
                    </option>
                  ))}
                </select>

                <select
                  value={relation.relationType}
                  onChange={(event) => {
                    const nextType = event.target.value as RelationTypeValue;
                    updateField(
                      "relations",
                      form.relations.map((item, itemIndex) =>
                        itemIndex === relationIndex
                          ? {
                              ...item,
                              relationType: nextType,
                              isBidirectional: defaultBidirectional(nextType)
                            }
                          : item
                      )
                    );
                  }}
                  className="app-input"
                >
                  {RELATION_TYPE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {RELATION_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>

                <input
                  value={relation.label ?? ""}
                  onChange={(event) =>
                    updateField(
                      "relations",
                      form.relations.map((item, itemIndex) =>
                        itemIndex === relationIndex ? { ...item, label: event.target.value } : item
                      )
                    )
                  }
                  className="app-input md:col-span-2"
                  placeholder={RELATION_TYPE_HELPERS[relation.relationType]}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={relation.isBidirectional}
                    onChange={(event) =>
                      updateField(
                        "relations",
                        form.relations.map((item, itemIndex) =>
                          itemIndex === relationIndex
                            ? { ...item, isBidirectional: event.target.checked }
                            : item
                        )
                      )
                    }
                  />
                  Show in both directions
                </label>
                <button
                  type="button"
                  className="tap-button-secondary"
                  onClick={() =>
                    updateField(
                      "relations",
                      form.relations.filter((_, itemIndex) => itemIndex !== relationIndex)
                    )
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove relation
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {successMessage ? <p className="text-sm text-moss-700">{successMessage}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="tap-button-primary" disabled={isSaving}>
          {isSaving ? "Saving..." : mode === "create" ? "Create word" : "Save changes"}
        </button>
        <button
          type="button"
          className="tap-button-secondary"
          onClick={() => {
            router.push("/admin/words");
          }}
        >
          Back to words
        </button>
      </div>
    </form>
  );
}
