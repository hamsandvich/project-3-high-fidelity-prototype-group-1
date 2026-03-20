import Papa from "papaparse";

import { prisma } from "@/lib/prisma";
import { saveWordCore, replaceWordRelations } from "@/lib/word-service";
import { slugify, toBoolean } from "@/lib/utils";
import { importBatchSchema } from "@/lib/validators";
import type { ImportWordPayload, RelationInput } from "@/types";

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
    relations: parseNestedField(row.relations, []),
    isDemo: toBoolean(row.isDemo, true)
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
    select: { id: true, slug: true, lemma: true }
  });

  const wordBySlug = new Map(existingWords.map((word) => [word.slug, word]));
  const wordByLemma = new Map(existingWords.map((word) => [word.lemma.toLowerCase(), word]));
  const savedRecords = new Map<string, { id: string; lemma: string; slug: string }>();

  for (const word of batch) {
    const categoryIds = buildCategoryIds(word, categoryMap);
    const guessedSlug = slugify(word.lemma);
    const existing = wordBySlug.get(guessedSlug) ?? wordByLemma.get(word.lemma.toLowerCase());

    const saved = await saveWordCore(
      {
        ...word,
        categoryIds,
        relations: []
      },
      existing?.id
    );

    savedRecords.set(saved.id, { id: saved.id, lemma: saved.lemma, slug: saved.slug });
    wordBySlug.set(saved.slug, saved);
    wordByLemma.set(saved.lemma.toLowerCase(), saved);
  }

  for (const word of batch) {
    const current = wordByLemma.get(word.lemma.toLowerCase()) ?? wordBySlug.get(slugify(word.lemma));
    if (!current) {
      continue;
    }

    const relations = (word.relations ?? [])
      .map<RelationInput | null>((relation) => {
        const target =
          (relation.toWordId
            ? Array.from(wordBySlug.values()).find((entry) => entry.id === relation.toWordId)
            : undefined) ??
          (relation.targetSlug ? wordBySlug.get(slugify(relation.targetSlug)) : undefined) ??
          (relation.targetLemma ? wordByLemma.get(relation.targetLemma.toLowerCase()) : undefined);

        if (!target || target.id === current.id) {
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

    await replaceWordRelations(current.id, relations);
  }

  return {
    importedCount: batch.length,
    categoryCount: categoryMap.size
  };
}
