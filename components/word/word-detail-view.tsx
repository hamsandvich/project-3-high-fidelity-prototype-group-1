"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Languages, Sparkles } from "lucide-react";

import { SaveWordButton } from "@/components/word/save-word-button";
import { PlayWordButton } from "@/components/word/play-word-button";
import { useAppState } from "@/components/providers/app-providers";
import { RELATION_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DetailMode } from "@/types";
import type { WordDetailModel } from "@/types/view-models";

const DETAIL_MODE_KEY = "altlab-vocabulary-explorer-detail-mode";

type WordDetailViewProps = {
  word: WordDetailModel;
};

const ITWEWINA_LABEL_MODE_TITLES = [
  "Plain English labels",
  "Linguistic labels",
  "nêhiyawêwin labels"
] as const;

function isItwewinaLabelModeTitle(value: string): value is (typeof ITWEWINA_LABEL_MODE_TITLES)[number] {
  return ITWEWINA_LABEL_MODE_TITLES.includes(value as (typeof ITWEWINA_LABEL_MODE_TITLES)[number]);
}

function getLabelModeButtonLabel(title: (typeof ITWEWINA_LABEL_MODE_TITLES)[number]) {
  switch (title) {
    case "Plain English labels":
      return "Plain English";
    case "Linguistic labels":
      return "Linguistic";
    case "nêhiyawêwin labels":
      return "nêhiyawêwin";
    default:
      return title;
  }
}

function getItwewinaReferenceGroupLabel(kind: "rapidwords" | "wordnet") {
  return kind === "rapidwords" ? "RapidWords" : "WordNet";
}

function renderReferenceLabel(label: string, detail?: string | null) {
  return detail ? `${label} (${detail})` : label;
}

function MorphologyTableSection({ table }: { table: WordDetailModel["morphologyTables"][number] }) {
  const columnLabels = table.entries.reduce<string[]>((labels, entry) => {
    const value = entry.columnLabel?.trim();

    if (value && !labels.includes(value)) {
      labels.push(value);
    }

    return labels;
  }, []);

  if (columnLabels.length > 0) {
    const rowLabels = table.entries.reduce<string[]>((labels, entry) => {
      if (!labels.includes(entry.rowLabel)) {
        labels.push(entry.rowLabel);
      }

      return labels;
    }, []);
    const entryByCoordinate = new Map(
      table.entries.map((entry) => [`${entry.rowLabel}::${entry.columnLabel ?? ""}`, entry] as const)
    );

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm text-slate-700">
          <thead>
            <tr>
              <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Label</th>
              {columnLabels.map((columnLabel) => (
                <th
                  key={`${table.id}-${columnLabel}`}
                  className="min-w-36 py-2 pr-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
                >
                  {columnLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((rowLabel) => (
              <tr key={`${table.id}-${rowLabel}`} className="align-top">
                <th className="rounded-l-2xl bg-slate-50 px-4 py-3 font-semibold text-slate-900">{rowLabel}</th>
                {columnLabels.map((columnLabel, columnIndex) => {
                  const entry = entryByCoordinate.get(`${rowLabel}::${columnLabel}`);

                  return (
                    <td
                      key={`${table.id}-${rowLabel}-${columnLabel}`}
                      className={cn(
                        "bg-slate-50 px-4 py-3",
                        columnIndex === columnLabels.length - 1 ? "rounded-r-2xl" : ""
                      )}
                    >
                      <p className={cn("font-semibold", entry?.value === "—" ? "text-slate-400" : "text-slate-900")}>
                        {entry?.value ?? "—"}
                      </p>
                      {entry?.plainLabel && entry.plainLabel !== entry.value ? (
                        <p className="mt-1 text-xs text-slate-500">{entry.plainLabel}</p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm text-slate-700">
        <tbody>
          {table.entries.map((entry) => (
            <tr key={entry.id} className="border-b border-slate-100 last:border-b-0">
              <th className="py-3 pr-4 align-top font-semibold text-slate-900">{entry.rowLabel}</th>
              <td className={cn("py-3 align-top font-semibold", entry.value === "—" ? "text-slate-400" : "text-slate-900")}>
                {entry.value}
                {entry.plainLabel && entry.plainLabel !== entry.value ? (
                  <p className="mt-1 text-xs font-normal text-slate-500">{entry.plainLabel}</p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WordDetailView({ word }: WordDetailViewProps) {
  const { preferences } = useAppState();
  const [mode, setMode] = useState<DetailMode>("novice");
  const [selectedLabelMode, setSelectedLabelMode] = useState<string>("");

  useEffect(() => {
    const saved = window.localStorage.getItem(DETAIL_MODE_KEY);
    if (saved === "novice" || saved === "expert") {
      setMode(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DETAIL_MODE_KEY, mode);
  }, [mode]);

  const labelModeGroups = ITWEWINA_LABEL_MODE_TITLES.filter((title) =>
    word.morphologyTables.some((table) => table.title === title)
  ).map((title) => ({
    title,
    tables: word.morphologyTables.filter((table) => table.title === title)
  }));

  const additionalMorphologyTables = word.morphologyTables.filter((table) => !isItwewinaLabelModeTitle(table.title));
  const selectedLabelModeGroup =
    labelModeGroups.find((group) => group.title === selectedLabelMode) ?? labelModeGroups[0] ?? null;
  const relatedReferences = word.itwewinaMetadata?.relatedReferences ?? [];
  const relatedReferenceGroups = [
    {
      kind: "rapidwords" as const,
      items: relatedReferences.filter((reference) => reference.kind === "rapidwords")
    },
    {
      kind: "wordnet" as const,
      items: relatedReferences.filter((reference) => reference.kind === "wordnet")
    }
  ].filter((group) => group.items.length > 0);
  const inflectionalClass = word.itwewinaMetadata?.inflectionalClass;

  useEffect(() => {
    if (labelModeGroups.length === 0) {
      if (selectedLabelMode) {
        setSelectedLabelMode("");
      }
      return;
    }

    if (selectedLabelMode && labelModeGroups.some((group) => group.title === selectedLabelMode)) {
      return;
    }

    setSelectedLabelMode(
      labelModeGroups.some((group) => group.title === "Linguistic labels")
        ? "Linguistic labels"
        : labelModeGroups[0]?.title ?? ""
    );
  }, [labelModeGroups, selectedLabelMode]);

  const creeFirst = preferences.uiLanguageEmphasis === "cree";

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {creeFirst ? (
              <>
                <h2 className="text-3xl leading-tight text-slate-900">{word.lemma}</h2>
                {preferences.showSyllabics && word.syllabics ? (
                  <p className="mt-2 text-sm text-slate-500">{word.syllabics}</p>
                ) : null}
                <p className="mt-4 text-base font-medium text-slate-700">{word.plainEnglish}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-slate-900">{word.plainEnglish}</p>
                <h2 className="mt-4 text-3xl leading-tight text-slate-800">{word.lemma}</h2>
                {preferences.showSyllabics && word.syllabics ? (
                  <p className="mt-2 text-sm text-slate-500">{word.syllabics}</p>
                ) : null}
              </>
            )}
          </div>
          <span className="chip">{word.partOfSpeech}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <SaveWordButton
            word={{
              id: word.id,
              slug: word.slug,
              lemma: word.lemma,
              syllabics: word.syllabics,
              plainEnglish: word.plainEnglish,
              partOfSpeech: word.partOfSpeech
            }}
          />
          <PlayWordButton
            lemma={word.lemma}
            spokenText={word.pronunciation ?? word.lemma}
            audioUrl={word.audioUrl}
          />
          <Link href={`/word/${word.slug}/map`} className="tap-button-secondary">
            <Sparkles className="mr-2 h-4 w-4" />
            Open map
          </Link>
        </div>

        {word.categories.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {word.categories.map((entry) => (
              <Link key={entry.category.id} href={`/category/${entry.category.slug}`} className="chip">
                {entry.category.name}
              </Link>
            ))}
          </div>
        ) : null}

        {mode === "expert" && (inflectionalClass || word.rootStem) ? (
          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/90 p-4">
            <div className="flex flex-wrap items-center gap-3 text-slate-900">
              {word.linguisticClass ? <span className="chip bg-white">{word.linguisticClass}</span> : null}
              {inflectionalClass?.emoji ? <span className="text-xl leading-none">{inflectionalClass.emoji}</span> : null}
              {inflectionalClass?.description ? <p className="font-semibold">{inflectionalClass.description}</p> : null}
            </div>
            {inflectionalClass?.examples ? (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                like: {inflectionalClass.examples} - tâpiskôc: {inflectionalClass.examples}
              </p>
            ) : null}
            {word.rootStem ? <p className="mt-2 text-xs text-slate-500">Stem: {word.rootStem}</p> : null}
          </div>
        ) : null}

        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="mb-3 flex items-center gap-2">
            <Languages className="h-4 w-4 text-moss-700" />
            <p className="text-sm font-semibold text-slate-800">Novice / Expert mode</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["novice", "expert"] as DetailMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn(
                  "tap-button text-sm",
                  mode === option ? "bg-moss-700 text-white" : "bg-white text-slate-600"
                )}
              >
                {option === "novice" ? "Novice" : "Expert"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-moss-700" />
          <p className="text-base font-semibold text-slate-900">
            {mode === "novice" ? "Meanings and related ideas" : "Meanings, relations, and analysis"}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {word.meanings.map((meaning) => (
            <div key={meaning.id} className="surface-muted p-3">
              <p className="font-semibold text-slate-900">{meaning.gloss}</p>
              {meaning.description ? <p className="mt-1 text-sm text-slate-600">{meaning.description}</p> : null}
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {mode === "expert" && relatedReferenceGroups.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-900">Imported Itwêwina references</p>
              {relatedReferenceGroups.map((group) => (
                <div key={group.kind}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {getItwewinaReferenceGroupLabel(group.kind)}
                  </p>
                  <div className="mt-2 space-y-2">
                    {group.items.map((reference) => (
                      reference.url ? (
                        <a
                          key={`${group.kind}-${reference.label}-${reference.detail ?? ""}`}
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                          className="surface-muted flex items-center justify-between gap-3 p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              {renderReferenceLabel(reference.label, reference.detail)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Source: {getItwewinaReferenceGroupLabel(group.kind)}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </a>
                      ) : (
                        <div
                          key={`${group.kind}-${reference.label}-${reference.detail ?? ""}`}
                          className="surface-muted p-3"
                        >
                          <p className="font-semibold text-slate-900">
                            {renderReferenceLabel(reference.label, reference.detail)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Source: {getItwewinaReferenceGroupLabel(group.kind)}
                          </p>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {word.relatedSections.map((section) => (
            <div key={section.relationType}>
              <p className="text-sm font-semibold text-slate-900">
                {RELATION_TYPE_LABELS[section.relationType]}
              </p>
              <div className="mt-2 space-y-2">
                {section.items.map((item) => (
                  <Link
                    key={`${item.relationType}-${item.word.id}`}
                    href={`/word/${item.word.slug}`}
                    className="surface-muted flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{item.word.lemma}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.word.plainEnglish}</p>
                      {item.label ? <p className="mt-1 text-xs text-slate-500">{item.label}</p> : null}
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {mode === "expert" ? (
        <>
          <section className="surface-card p-5">
            <p className="section-label">Technical details</p>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700">
              <div className="surface-muted p-3">
                <dt className="font-semibold text-slate-900">Part of speech</dt>
                <dd className="mt-1">{word.partOfSpeech}</dd>
              </div>
              {word.linguisticClass && !inflectionalClass ? (
                <div className="surface-muted p-3">
                  <dt className="font-semibold text-slate-900">Linguistic classification</dt>
                  <dd className="mt-1">{word.linguisticClass}</dd>
                </div>
              ) : null}
              {word.rootStem ? (
                <div className="surface-muted p-3">
                  <dt className="font-semibold text-slate-900">Root or stem</dt>
                  <dd className="mt-1">{word.rootStem}</dd>
                </div>
              ) : null}
              {word.pronunciation ? (
                <div className="surface-muted p-3">
                  <dt className="font-semibold text-slate-900">Pronunciation</dt>
                  <dd className="mt-1">{word.pronunciation}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {word.morphologyTables.length ? (
            <section className="space-y-4">
              {labelModeGroups.length > 0 ? (
                <div className="surface-card overflow-hidden">
                  <div className="border-b border-slate-200/80 px-5 py-4">
                    <p className="section-label">Itwêwina paradigm labels</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {labelModeGroups.map((group) => (
                        <button
                          key={group.title}
                          type="button"
                          onClick={() => setSelectedLabelMode(group.title)}
                          className={cn(
                            "tap-button text-sm",
                            selectedLabelModeGroup?.title === group.title
                              ? "bg-moss-700 text-white"
                              : "bg-white text-slate-600"
                          )}
                        >
                          {getLabelModeButtonLabel(group.title)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-5 px-5 py-4">
                    {selectedLabelModeGroup?.tables.map((table) => (
                      <div key={table.id}>
                        {table.description ? <p className="section-label">{table.description}</p> : null}
                        <div className={table.description ? "mt-2" : ""}>
                          <MorphologyTableSection table={table} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {additionalMorphologyTables.map((table) => (
                <div key={table.id} className="surface-card overflow-hidden">
                  <div className="border-b border-slate-200/80 px-5 py-4">
                    <p className="section-label">{table.isPlainEnglish ? "Learner table" : "Expert table"}</p>
                    <h3 className="mt-2 text-xl text-slate-900">{table.title}</h3>
                    {table.description ? <p className="mt-2 text-sm text-slate-600">{table.description}</p> : null}
                  </div>
                  <div className="px-5 py-4">
                    <MorphologyTableSection table={table} />
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {(word.source || word.notes) ? (
            <section className="surface-card p-5">
              <p className="section-label">Source and notes</p>
              {word.source ? <p className="mt-3 text-sm leading-7 text-slate-700">{word.source}</p> : null}
              {word.notes ? <p className="mt-3 text-sm leading-7 text-slate-600">{word.notes}</p> : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
