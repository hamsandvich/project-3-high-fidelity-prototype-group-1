import Papa from "papaparse";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { replaceWordRelations, saveWordCore } from "@/lib/word-service";
import { slugify } from "@/lib/utils";
import { importBatchSchema } from "@/lib/validators";
import type { ImportWordPayload, RelationInput, WordFormPayload } from "@/types";

const existingImportWordSelect = {
  id: true,
  slug: true,
  lemma: true
} satisfies Prisma.WordSelect;

type ExistingImportWord = Prisma.WordGetPayload<{
  select: typeof existingImportWordSelect;
}>;

function buildImportWordPayload(word: ImportWordPayload, categoryIds: string[]): WordFormPayload {
  return {
    lemma: word.lemma,
    syllabics: word.syllabics,
    plainEnglish: word.plainEnglish,
    partOfSpeech: word.partOfSpeech,
    linguisticClass: word.linguisticClass,
    rootStem: word.rootStem,
    pronunciation: word.pronunciation,
    audioUrl: word.audioUrl,
    source: word.source,
    notes: word.notes,
    itwewinaMetadata: word.itwewinaMetadata,
    beginnerExplanation: word.beginnerExplanation,
    expertExplanation: word.expertExplanation,
    categoryIds,
    meanings: word.meanings,
    morphologyTables: word.morphologyTables,
    relations: []
  };
}

function parseJsonPayload(rawText: string) {
  const parsed = JSON.parse(rawText) as unknown;

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { words?: unknown[] }).words)) {
    return (parsed as { words: unknown[] }).words;
  }

  return [parsed];
}

function parseListField(value?: string) {
  return (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNestedField<T>(value: string | undefined, fallback: T): T {
  const raw = value?.trim();

  if (!raw) {
    return fallback;
  }

  if (raw.startsWith("[") || raw.startsWith("{")) {
    return JSON.parse(raw) as T;
  }

  return fallback;
}

function parseCsvPayload(rawText: string) {
  const results = Papa.parse<Record<string, string>>(rawText, {
    header: true,
    skipEmptyLines: "greedy"
  });

  if (results.errors.length > 0) {
    throw new Error(results.errors[0]?.message ?? "CSV parsing failed.");
  }

  return results.data.map<ImportWordPayload>((row) => ({
    lemma: row.lemma ?? "",
    syllabics: row.syllabics ?? "",
    plainEnglish: row.plainEnglish ?? "",
    partOfSpeech: row.partOfSpeech ?? "",
    linguisticClass: row.linguisticClass ?? "",
    rootStem: row.rootStem ?? "",
    pronunciation: row.pronunciation ?? "",
    audioUrl: row.audioUrl ?? "",
    source: row.source ?? "",
    notes: row.notes ?? "",
    itwewinaMetadata: parseNestedField(row.itwewinaMetadata, undefined),
    beginnerExplanation: row.beginnerExplanation ?? "",
    expertExplanation: row.expertExplanation ?? "",
    categoryIds: parseNestedField<string[]>(row.categoryIds, []),
    categorySlugs: parseNestedField<string[]>(row.categorySlugs, parseListField(row.categorySlugs)),
    categoryNames: parseNestedField<string[]>(row.categoryNames, parseListField(row.categoryNames)),
    meanings: parseNestedField(row.meanings, []),
    morphologyTables: parseNestedField(row.morphologyTables, []),
    relations: parseNestedField(row.relations, [])
  }));
}

export function parseImportInput(mode: "json" | "csv", rawText: string) {
  const parsed = mode === "json" ? parseJsonPayload(rawText) : parseCsvPayload(rawText);
  return importBatchSchema.parse(parsed);
}

async function ensureCategoryIdMaps(words: ImportWordPayload[]) {
  const slugSet = new Set<string>();

  words.forEach((word) => {
    word.categorySlugs?.forEach((slug) => slugSet.add(slugify(slug)));
    word.categoryNames?.forEach((name) => slugSet.add(slugify(name)));
  });

  const existingCategories = slugSet.size
    ? await prisma.category.findMany({
        where: { slug: { in: Array.from(slugSet) } }
      })
    : [];

  const categoryMap = new Map(existingCategories.map((category) => [category.slug, category.id]));

  for (const word of words) {
    const pendingNames = word.categoryNames ?? [];
    for (const name of pendingNames) {
      const slug = slugify(name);
      if (!slug || categoryMap.has(slug)) {
        continue;
      }

      const category = await prisma.category.create({
        data: {
          name,
          slug,
          description: "Imported category placeholder. Review and refine in the admin dashboard."
        }
      });

      categoryMap.set(category.slug, category.id);
    }
  }

  return categoryMap;
}

function buildCategoryIds(word: ImportWordPayload, categoryMap: Map<string, string>) {
  const directIds = word.categoryIds ?? [];
  const slugIds = (word.categorySlugs ?? []).map((slug) => categoryMap.get(slugify(slug)));
  const nameIds = (word.categoryNames ?? []).map((name) => categoryMap.get(slugify(name)));

  return [...directIds, ...slugIds, ...nameIds].filter((value): value is string => Boolean(value));
}

export async function importWords(words: ImportWordPayload[]) {
  const batch = importBatchSchema.parse(words);
  const categoryMap = await ensureCategoryIdMaps(batch);

  const existingWords = await prisma.word.findMany({
    select: existingImportWordSelect
  });

  const wordById = new Map(existingWords.map((word) => [word.id, word]));
  const wordBySlug = new Map(existingWords.map((word) => [word.slug, word]));
  const wordByLemma = new Map(existingWords.map((word) => [word.lemma.toLowerCase(), word]));
  const relationSourcesByWordId = new Map<string, NonNullable<ImportWordPayload["relations"]>>();

  for (const word of batch) {
    const categoryIds = buildCategoryIds(word, categoryMap);
    const guessedSlug = slugify(word.lemma);
    const existing = wordBySlug.get(guessedSlug) ?? wordByLemma.get(word.lemma.toLowerCase());

    const saved = await saveWordCore(
      {
        ...buildImportWordPayload(word, categoryIds),
        relations: []
      },
      existing?.id
    );

    const savedSummary: ExistingImportWord = {
      id: saved.id,
      slug: saved.slug,
      lemma: saved.lemma
    };

    relationSourcesByWordId.set(saved.id, word.relations ?? []);
    wordById.set(savedSummary.id, savedSummary);
    wordBySlug.set(savedSummary.slug, savedSummary);
    wordByLemma.set(savedSummary.lemma.toLowerCase(), savedSummary);
  }

  for (const [wordId, relationSource] of relationSourcesByWordId.entries()) {
    const relations = relationSource
      .map<RelationInput | null>((relation) => {
        const target =
          (relation.toWordId ? wordById.get(relation.toWordId) : undefined) ??
          (relation.targetSlug ? wordBySlug.get(slugify(relation.targetSlug)) : undefined) ??
          (relation.targetLemma ? wordByLemma.get(relation.targetLemma.toLowerCase()) : undefined);

        if (!target || target.id === wordId) {
          return null;
        }

        return {
          toWordId: target.id,
          relationType: relation.relationType,
          label: relation.label,
          isBidirectional: relation.isBidirectional
        };
      })
      .filter((relation): relation is RelationInput => Boolean(relation));

    await replaceWordRelations(wordId, relations);
  }

  return {
    importedCount: batch.length,
    categoryCount: categoryMap.size
  };
}
