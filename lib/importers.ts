import Papa from "papaparse";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saveWordCore, replaceWordRelations } from "@/lib/word-service";
import { slugify, toBoolean } from "@/lib/utils";
import { importBatchSchema } from "@/lib/validators";
import type { ImportWordPayload, RelationInput, WordFormPayload } from "@/types";

const existingImportWordSelect = {
  id: true,
  slug: true,
  lemma: true,
  plainEnglish: true,
  partOfSpeech: true,
  isDemo: true
} satisfies Prisma.WordSelect;

type ExistingImportWord = Prisma.WordGetPayload<{
  select: typeof existingImportWordSelect;
}>;

const demoImportOverwriteInclude = {
  meanings: {
    orderBy: [{ sortOrder: "asc" }]
  },
  morphologyTables: {
    orderBy: [{ sortOrder: "asc" }],
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }]
      }
    }
  },
  categories: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      categoryId: true
    }
  },
  outgoingRelations: {
    orderBy: [{ createdAt: "asc" }],
    select: {
      toWordId: true,
      relationType: true,
      label: true,
      isBidirectional: true
    }
  }
} satisfies Prisma.WordInclude;

type ExistingDemoImportWord = Prisma.WordGetPayload<{
  include: typeof demoImportOverwriteInclude;
}>;

function hasTextContent(value?: string | null) {
  return (value ?? "").trim().length > 0;
}

function chooseImportedText(importedValue: string | undefined, existingValue?: string | null) {
  return hasTextContent(importedValue) ? importedValue ?? "" : existingValue ?? "";
}

function mapExistingMeanings(meanings: ExistingDemoImportWord["meanings"]): WordFormPayload["meanings"] {
  return meanings.map((meaning, index) => ({
    gloss: meaning.gloss,
    description: meaning.description ?? "",
    sortOrder: index
  }));
}

function mapExistingMorphologyTables(
  tables: ExistingDemoImportWord["morphologyTables"]
): WordFormPayload["morphologyTables"] {
  return tables.map((table, tableIndex) => ({
    title: table.title,
    description: table.description ?? "",
    isPlainEnglish: table.isPlainEnglish,
    sortOrder: tableIndex,
    entries: table.entries.map((entry, entryIndex) => ({
      rowLabel: entry.rowLabel,
      columnLabel: entry.columnLabel ?? "",
      plainLabel: entry.plainLabel ?? "",
      value: entry.value,
      sortOrder: entryIndex
    }))
  }));
}

function mapExistingRelations(
  relations: ExistingDemoImportWord["outgoingRelations"]
): NonNullable<ImportWordPayload["relations"]> {
  return relations.map((relation) => ({
    toWordId: relation.toWordId,
    relationType: relation.relationType,
    label: relation.label ?? "",
    isBidirectional: relation.isBidirectional
  }));
}

function findDemoWordByPlainEnglish(
  word: ImportWordPayload,
  demoWordsByPlainEnglish: Map<string, ExistingImportWord[]>
) {
  if (word.isDemo) {
    return undefined;
  }

  const normalizedGloss = word.plainEnglish.trim().toLowerCase();
  if (!normalizedGloss) {
    return undefined;
  }

  const demoMatches = demoWordsByPlainEnglish.get(normalizedGloss) ?? [];
  if (demoMatches.length === 0) {
    return undefined;
  }

  const normalizedPartOfSpeech = word.partOfSpeech.trim().toLowerCase();
  if (!normalizedPartOfSpeech) {
    return demoMatches[0];
  }

  return (
    demoMatches.find((candidate) => candidate.partOfSpeech.trim().toLowerCase() === normalizedPartOfSpeech) ??
    demoMatches[0]
  );
}

function buildImportWordPayload(
  word: ImportWordPayload,
  categoryIds: string[],
  existingDemoWord?: ExistingDemoImportWord
): WordFormPayload {
  const fallbackCategoryIds = existingDemoWord?.categories.map((entry) => entry.categoryId) ?? [];
  const fallbackMeanings = existingDemoWord ? mapExistingMeanings(existingDemoWord.meanings) : [];
  const fallbackMorphologyTables = existingDemoWord
    ? mapExistingMorphologyTables(existingDemoWord.morphologyTables)
    : [];

  return {
    lemma: chooseImportedText(word.lemma, existingDemoWord?.lemma),
    syllabics: chooseImportedText(word.syllabics, existingDemoWord?.syllabics),
    plainEnglish: chooseImportedText(word.plainEnglish, existingDemoWord?.plainEnglish),
    partOfSpeech: chooseImportedText(word.partOfSpeech, existingDemoWord?.partOfSpeech),
    linguisticClass: chooseImportedText(word.linguisticClass, existingDemoWord?.linguisticClass),
    rootStem: chooseImportedText(word.rootStem, existingDemoWord?.rootStem),
    pronunciation: chooseImportedText(word.pronunciation, existingDemoWord?.pronunciation),
    audioUrl: chooseImportedText(word.audioUrl, existingDemoWord?.audioUrl),
    source: chooseImportedText(word.source, existingDemoWord?.source),
    notes: chooseImportedText(word.notes, existingDemoWord?.notes),
    itwewinaMetadata:
      word.itwewinaMetadata ?? (existingDemoWord?.itwewinaMetadata as ImportWordPayload["itwewinaMetadata"] | null) ?? undefined,
    beginnerExplanation: chooseImportedText(word.beginnerExplanation, existingDemoWord?.beginnerExplanation),
    expertExplanation: chooseImportedText(word.expertExplanation, existingDemoWord?.expertExplanation),
    categoryIds: categoryIds.length > 0 ? categoryIds : fallbackCategoryIds,
    meanings: word.meanings.length > 0 ? word.meanings : fallbackMeanings,
    morphologyTables: word.morphologyTables.length > 0 ? word.morphologyTables : fallbackMorphologyTables,
    relations: [],
    isDemo: word.isDemo
  };
}

function buildImportRelationSource(
  word: ImportWordPayload,
  existingDemoWord?: ExistingDemoImportWord
): NonNullable<ImportWordPayload["relations"]> {
  if ((word.relations ?? []).length > 0) {
    return word.relations ?? [];
  }

  return existingDemoWord ? mapExistingRelations(existingDemoWord.outgoingRelations) : [];
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
    select: existingImportWordSelect
  });

  const wordBySlug = new Map(existingWords.map((word) => [word.slug, word]));
  const wordByLemma = new Map(existingWords.map((word) => [word.lemma.toLowerCase(), word]));
  const demoWordsByPlainEnglish = new Map<string, ExistingImportWord[]>();
  const relationSourcesByWordId = new Map<string, NonNullable<ImportWordPayload["relations"]>>();
  const demoOverwriteCache = new Map<string, ExistingDemoImportWord>();

  existingWords.forEach((word) => {
    if (!word.isDemo) {
      return;
    }

    const key = word.plainEnglish.trim().toLowerCase();
    if (!key) {
      return;
    }

    const existing = demoWordsByPlainEnglish.get(key) ?? [];
    existing.push(word);
    demoWordsByPlainEnglish.set(key, existing);
  });

  for (const word of batch) {
    const categoryIds = buildCategoryIds(word, categoryMap);
    const guessedSlug = slugify(word.lemma);
    const existing =
      wordBySlug.get(guessedSlug) ??
      wordByLemma.get(word.lemma.toLowerCase()) ??
      findDemoWordByPlainEnglish(word, demoWordsByPlainEnglish);

    let existingDemoWord: ExistingDemoImportWord | undefined;

    if (existing?.isDemo && !word.isDemo) {
      existingDemoWord = demoOverwriteCache.get(existing.id);

      if (!existingDemoWord) {
        const loadedDemoWord = await prisma.word.findUnique({
          where: { id: existing.id },
          include: demoImportOverwriteInclude
        });

        if (!loadedDemoWord) {
          throw new Error(`Unable to load demo word ${existing.lemma} for import overwrite.`);
        }

        existingDemoWord = loadedDemoWord;
        demoOverwriteCache.set(existing.id, loadedDemoWord);
      }
    }

    const payload = buildImportWordPayload(word, categoryIds, existingDemoWord);
    const relationSource = buildImportRelationSource(word, existingDemoWord);

    const saved = await saveWordCore(
      {
        ...payload,
        relations: []
      },
      existing?.id
    );

    const savedSummary: ExistingImportWord = {
      id: saved.id,
      slug: saved.slug,
      lemma: saved.lemma,
      plainEnglish: saved.plainEnglish,
      partOfSpeech: saved.partOfSpeech,
      isDemo: saved.isDemo
    };

    relationSourcesByWordId.set(saved.id, relationSource);
    wordBySlug.set(savedSummary.slug, savedSummary);
    wordByLemma.set(savedSummary.lemma.toLowerCase(), savedSummary);
  }

  for (const [wordId, relationSource] of relationSourcesByWordId.entries()) {
    const relations = relationSource
      .map<RelationInput | null>((relation) => {
        const target =
          (relation.toWordId ? Array.from(wordBySlug.values()).find((entry) => entry.id === relation.toWordId) : undefined) ??
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
