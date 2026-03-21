import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { generateStructuredObject, isOpenAIConfigured } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueBy } from "@/lib/utils";
import type { ItwewinaMetadata } from "@/types";

const AI_RELATION_TYPE_VALUES = [
  "synonym",
  "antonym",
  "broader",
  "narrower",
  "associated",
  "variant",
  "similar"
] as const;
const SYMMETRIC_RELATION_TYPES = new Set(["synonym", "antonym", "associated", "variant", "similar"]);
const ENRICHMENT_BATCH_SIZE = 10;
const CATALOG_CONTEXT_WORD_LIMITS = [180, 120, 80, 50, 30] as const;
const MAX_CATEGORY_DESCRIPTION_LENGTH = 120;
const MAX_SUMMARY_MEANINGS = 3;
const MAX_SUMMARY_CATEGORIES = 4;

const catalogWordSuggestionSchema = z.object({
  wordId: z.string().trim().min(1),
  categorySlugs: z.array(z.string().trim().min(1)).max(3).default([]),
  beginnerExplanation: z.string().trim().max(320).default(""),
  expertExplanation: z.string().trim().max(600).default(""),
  relations: z
    .array(
      z.object({
        targetWordId: z.string().trim().min(1),
        relationType: z.enum(AI_RELATION_TYPE_VALUES),
        rationale: z.string().trim().max(220).default("")
      })
    )
    .max(5)
    .default([])
});

const catalogEnrichmentSchema = z.object({
  words: z.array(catalogWordSuggestionSchema).default([])
});

const lessonPlanSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  targetAudience: z.string().trim().min(1),
  totalDurationMinutes: z.number().int().min(15).max(180),
  objectives: z.array(z.string().trim().min(1)).min(3).max(6),
  materials: z.array(z.string().trim().min(1)).min(3).max(8),
  vocabularyFocus: z
    .array(
      z.object({
        lemma: z.string().trim().min(1),
        plainEnglish: z.string().trim().min(1),
        teachingTip: z.string().trim().min(1)
      })
    )
    .min(3)
    .max(10),
  lessonSegments: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        durationMinutes: z.number().int().min(5).max(60),
        description: z.string().trim().min(1)
      })
    )
    .min(3)
    .max(6),
  assessment: z.string().trim().min(1),
  differentiation: z.object({
    support: z.array(z.string().trim().min(1)).min(2).max(4),
    extension: z.array(z.string().trim().min(1)).min(2).max(4)
  }),
  homeConnection: z.string().trim().min(1)
});

const flashcardDeckSchema = z.object({
  title: z.string().trim().min(1),
  studyTip: z.string().trim().min(1),
  cards: z
    .array(
      z.object({
        wordId: z.string().trim().min(1),
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
        hint: z.string().trim().min(1),
        practicePrompt: z.string().trim().min(1)
      })
    )
    .min(1)
});

const searchQuestionAnswerSchema = z.object({
  status: z.enum(["answered", "insufficient_context"]),
  answer: z.string().trim().min(1).max(1400),
  matchedWordIds: z.array(z.string().trim().min(1)).max(5).default([])
});

export type CatalogEnrichmentResult = {
  skipped: boolean;
  processedWords: number;
  addedCategoryAssignments: number;
  addedRelations: number;
  addedBeginnerExplanations: number;
  addedExpertExplanations: number;
  warning?: string;
};

export type CatalogEnrichmentProgressEvent = {
  completed: number;
  total: number;
  status: string;
};

export type GeneratedLessonPlan = z.infer<typeof lessonPlanSchema>;
export type GeneratedFlashcardDeck = z.infer<typeof flashcardDeckSchema>;
export type SearchQuestionAnswerResult = z.infer<typeof searchQuestionAnswerSchema>;
export type SearchQuestionContextWord = {
  id: string;
  slug: string;
  lemma: string;
  syllabics?: string | null;
  plainEnglish: string;
  partOfSpeech: string;
  linguisticClass?: string | null;
  rootStem?: string | null;
  beginnerExplanation?: string | null;
  expertExplanation?: string | null;
  notes?: string | null;
  source?: string | null;
  itwewinaMetadata?: ItwewinaMetadata | null;
  categories: string[];
  meanings: Array<{
    gloss: string;
    description?: string | null;
  }>;
  morphologyTables: Array<{
    title: string;
    description?: string | null;
    isPlainEnglish: boolean;
    entries: Array<{
      rowLabel: string;
      columnLabel?: string | null;
      plainLabel?: string | null;
      value: string;
    }>;
  }>;
};

type CatalogWordSuggestion = z.infer<typeof catalogWordSuggestionSchema>;

const aiCatalogSummaryWordSelect = {
  id: true,
  lemma: true,
  plainEnglish: true,
  partOfSpeech: true,
  linguisticClass: true,
  meanings: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      gloss: true
    }
  },
  categories: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      category: {
        select: {
          slug: true
        }
      }
    }
  }
} satisfies Prisma.WordSelect;

const aiFocusWordSelect = {
  id: true,
  lemma: true,
  syllabics: true,
  plainEnglish: true,
  partOfSpeech: true,
  linguisticClass: true,
  rootStem: true,
  beginnerExplanation: true,
  expertExplanation: true,
  meanings: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      gloss: true,
      description: true
    }
  },
  categories: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  }
} satisfies Prisma.WordSelect;

type AiCatalogSummaryWord = Prisma.WordGetPayload<{
  select: typeof aiCatalogSummaryWordSelect;
}>;

type AiFocusWord = Prisma.WordGetPayload<{
  select: typeof aiFocusWordSelect;
}>;

type CatalogPromptCategory = {
  slug: string;
  name: string;
  description?: string;
};

type CatalogPromptWord = {
  id: string;
  lemma: string;
  plainEnglish: string;
  partOfSpeech: string;
  linguisticClass?: string | null;
  categories: string[];
  meanings: string[];
};

type PreparedCatalogPromptWord = CatalogPromptWord & {
  searchTokens: string[];
};

function tokenizeCatalogText(...values: Array<string | null | undefined>) {
  return uniqueBy(
    values.flatMap((value) =>
      slugify(value ?? "")
        .split("-")
        .map((token) => token.trim())
        .filter((token) => token.length > 1)
    ),
    (token) => token
  );
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildCategoryPromptContext(
  categories: Array<{ slug: string; name: string; description: string | null }>
): CatalogPromptCategory[] {
  return categories.map((category) => ({
    slug: category.slug,
    name: category.name,
    ...(truncateText(category.description, MAX_CATEGORY_DESCRIPTION_LENGTH)
      ? { description: truncateText(category.description, MAX_CATEGORY_DESCRIPTION_LENGTH) }
      : {})
  }));
}

function buildCatalogSummary(words: AiCatalogSummaryWord[]): PreparedCatalogPromptWord[] {
  return words.map((word) => {
    const categories = word.categories.map((entry) => entry.category.slug).slice(0, MAX_SUMMARY_CATEGORIES);
    const meanings = uniqueBy(
      word.meanings.map((meaning) => meaning.gloss.trim()).filter(Boolean),
      (meaning) => meaning.toLowerCase()
    ).slice(0, MAX_SUMMARY_MEANINGS);

    return {
      id: word.id,
      lemma: word.lemma,
      plainEnglish: word.plainEnglish,
      partOfSpeech: word.partOfSpeech,
      linguisticClass: word.linguisticClass,
      categories,
      meanings,
      searchTokens: tokenizeCatalogText(
        word.lemma,
        word.plainEnglish,
        word.partOfSpeech,
        word.linguisticClass,
        ...categories,
        ...meanings
      )
    };
  });
}

function buildFocusWordTokens(word: AiFocusWord) {
  return tokenizeCatalogText(
    word.lemma,
    word.plainEnglish,
    word.partOfSpeech,
    word.linguisticClass,
    word.rootStem,
    ...word.categories.map((entry) => entry.category.slug),
    ...word.meanings.map((meaning) => meaning.gloss)
  );
}

function selectCatalogContextWords(
  catalogSummary: PreparedCatalogPromptWord[],
  batch: AiFocusWord[],
  limit: number
): CatalogPromptWord[] {
  if (catalogSummary.length <= limit) {
    return catalogSummary.map(({ searchTokens, ...word }) => word);
  }

  const focusIds = new Set(batch.map((word) => word.id));
  const focusCategorySlugs = new Set(batch.flatMap((word) => word.categories.map((entry) => entry.category.slug)));
  const focusPartsOfSpeech = new Set(batch.map((word) => word.partOfSpeech.toLowerCase()));
  const focusLinguisticClasses = new Set(
    batch.map((word) => word.linguisticClass?.trim().toLowerCase()).filter((value): value is string => Boolean(value))
  );
  const focusTokens = new Set(batch.flatMap((word) => buildFocusWordTokens(word)));
  const selectedWords: PreparedCatalogPromptWord[] = [];
  const selectedIds = new Set<string>();

  for (const word of catalogSummary) {
    if (focusIds.has(word.id)) {
      selectedWords.push(word);
      selectedIds.add(word.id);
    }
  }

  const rankedWords = [...catalogSummary]
    .map((word) => {
      let score = focusIds.has(word.id) ? 1_000 : 0;
      let sharedTokenCount = 0;

      for (const token of word.searchTokens) {
        if (focusTokens.has(token)) {
          sharedTokenCount += 1;
        }
      }

      score += Math.min(sharedTokenCount, 8) * 4;

      if (word.categories.some((slug) => focusCategorySlugs.has(slug))) {
        score += 8;
      }

      if (focusPartsOfSpeech.has(word.partOfSpeech.toLowerCase())) {
        score += 2;
      }

      if (word.linguisticClass && focusLinguisticClasses.has(word.linguisticClass.toLowerCase())) {
        score += 2;
      }

      return {
        word,
        score
      };
    })
    .sort((left, right) => right.score - left.score || left.word.lemma.localeCompare(right.word.lemma));

  for (const candidate of rankedWords) {
    if (selectedWords.length >= limit) {
      break;
    }

    if (selectedIds.has(candidate.word.id)) {
      continue;
    }

    selectedWords.push(candidate.word);
    selectedIds.add(candidate.word.id);
  }

  return selectedWords.slice(0, limit).map(({ searchTokens, ...word }) => word);
}

function buildCatalogContextWordLimits(totalCatalogWords: number) {
  return uniqueBy(
    CATALOG_CONTEXT_WORD_LIMITS.map((limit) => Math.min(totalCatalogWords, limit)).filter((limit) => limit > 0),
    (limit) => String(limit)
  );
}

function isContextWindowError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error && "message" in error && typeof error.message === "string"
          ? error.message
          : "";

  const normalized = message.toLowerCase();

  return (
    normalized.includes("context window") ||
    normalized.includes("maximum context length") ||
    normalized.includes("too many tokens") ||
    normalized.includes("input exceeds")
  );
}

async function generateCatalogEnrichmentForBatch(params: {
  categories: CatalogPromptCategory[];
  catalogSummary: PreparedCatalogPromptWord[];
  batch: AiFocusWord[];
}) {
  const { categories, catalogSummary, batch } = params;
  const contextWordLimits = buildCatalogContextWordLimits(catalogSummary.length);

  for (const contextWordLimit of contextWordLimits) {
    try {
      return await generateStructuredObject({
        task: "catalogEnrichment",
        schema: catalogEnrichmentSchema,
        schemaName: "vocabulary_catalog_enrichment",
        reasoningEffort: "low",
        instructions: [
          "You are enriching a Plains Cree vocabulary database used for education.",
          "For each focus word, choose up to 3 matching category slugs from the provided category list.",
          "Only use category slugs that already exist in the input.",
          "Then suggest up to 5 high-confidence relations from the focus word to other words already in the catalog.",
          "Use only these relation types: synonym, antonym, broader, narrower, associated, variant, similar.",
          "When you choose broader, the target word must be a broader term than the source word.",
          "When you choose narrower, the target word must be a narrower term than the source word.",
          'If needsBeginnerExplanation is true, write a learner-friendly beginnerExplanation in plain English using 1-2 short sentences.',
          'If needsExpertExplanation is true, write an expertExplanation using the linguistic or semantic context available in 1-3 concise sentences.',
          "If either explanation is not needed, return an empty string for that field.",
          "Do not invent grammar details, morphology, or cultural claims that are not supported by the provided context.",
          "Do not invent new words, new categories, or low-confidence links.",
          "Theme membership is handled through categories, so do not use categoryMember relations."
        ].join("\n"),
        input: JSON.stringify(
          {
            categories,
            catalogWords: selectCatalogContextWords(catalogSummary, batch, contextWordLimit),
            focusWords: batch.map((word) => ({
              id: word.id,
              lemma: word.lemma,
              syllabics: word.syllabics,
              plainEnglish: word.plainEnglish,
              partOfSpeech: word.partOfSpeech,
              linguisticClass: word.linguisticClass,
              rootStem: word.rootStem,
              needsBeginnerExplanation: !word.beginnerExplanation?.trim(),
              needsExpertExplanation: !word.expertExplanation?.trim(),
              beginnerExplanation: word.beginnerExplanation,
              expertExplanation: word.expertExplanation,
              meanings: word.meanings,
              categories: word.categories.map((entry) => entry.category.slug)
            }))
          },
          null,
          2
        )
      });
    } catch (error) {
      if (!isContextWindowError(error) || contextWordLimit === contextWordLimits.at(-1)) {
        throw error;
      }
    }
  }

  throw new Error("Unable to fit AI enrichment input into the model context window.");
}

function normalizeGeneratedExplanation(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildRelationEquivalenceKey(fromWordId: string, toWordId: string, relationType: (typeof AI_RELATION_TYPE_VALUES)[number]) {
  if (relationType === "broader") {
    return `${fromWordId}:${toWordId}:broader`;
  }

  if (relationType === "narrower") {
    return `${toWordId}:${fromWordId}:broader`;
  }

  if (SYMMETRIC_RELATION_TYPES.has(relationType)) {
    const [leftId, rightId] = [fromWordId, toWordId].sort();
    return `${leftId}:${rightId}:${relationType}`;
  }

  return `${fromWordId}:${toWordId}:${relationType}`;
}

function buildFallbackFlashcardDeck(
  words: Array<{
    id: string;
    lemma: string;
    syllabics?: string | null;
    plainEnglish: string;
    partOfSpeech: string;
    beginnerExplanation?: string | null;
    meanings: Array<{ gloss: string }>;
    categories: Array<{ category: { name: string } }>;
  }>
): GeneratedFlashcardDeck {
  return {
    title: "Saved words study deck",
    studyTip: "Try saying the Cree word aloud before flipping each card.",
    cards: words.map((word) => ({
      wordId: word.id,
      front: word.syllabics ? `${word.lemma}\n${word.syllabics}` : word.lemma,
      back: `${word.plainEnglish} (${word.partOfSpeech})`,
      hint:
        word.beginnerExplanation?.trim() ||
        `Think about ${word.categories[0]?.category.name?.toLowerCase() ?? "the theme"} and the gloss ${
          word.meanings[0]?.gloss ?? word.plainEnglish
        }.`,
      practicePrompt: `Use ${word.lemma} in a quick oral or written sentence about ${word.plainEnglish}.`
    }))
  };
}

async function applyCatalogEnrichmentSuggestions(params: {
  batchWords: AiFocusWord[];
  suggestions: CatalogWordSuggestion[];
  categoryBySlug: Map<string, { id: string; slug: string }>;
  catalogWordIdSet: Set<string>;
  seenRelationKeys: Set<string>;
}) {
  const { batchWords, suggestions, categoryBySlug, catalogWordIdSet, seenRelationKeys } = params;
  const wordById = new Map(batchWords.map((word) => [word.id, word]));
  const existingCategoryKeys = new Set(
    batchWords.flatMap((word) => word.categories.map((entry) => `${word.id}:${entry.category.id}`))
  );
  const nextCategorySortOrderByWordId = new Map(batchWords.map((word) => [word.id, word.categories.length]));
  const categoryAssignments: Array<{ wordId: string; categoryId: string; sortOrder: number }> = [];
  const explanationUpdates = new Map<
    string,
    {
      beginnerExplanation?: string;
      expertExplanation?: string;
    }
  >();
  const relationRows: Array<{
    fromWordId: string;
    toWordId: string;
    relationType: (typeof AI_RELATION_TYPE_VALUES)[number];
    isBidirectional: boolean;
  }> = [];

  for (const suggestion of suggestions) {
    const sourceWord = wordById.get(suggestion.wordId);

    if (!sourceWord) {
      continue;
    }

    for (const slug of uniqueBy(
      (suggestion.categorySlugs ?? []).map((value) => value.trim()).filter(Boolean),
      (value) => value
    )) {
      const category = categoryBySlug.get(slug);

      if (!category) {
        continue;
      }

      const categoryKey = `${sourceWord.id}:${category.id}`;

      if (existingCategoryKeys.has(categoryKey)) {
        continue;
      }

      const nextSortOrder = nextCategorySortOrderByWordId.get(sourceWord.id) ?? 0;

      categoryAssignments.push({
        wordId: sourceWord.id,
        categoryId: category.id,
        sortOrder: nextSortOrder
      });
      existingCategoryKeys.add(categoryKey);
      nextCategorySortOrderByWordId.set(sourceWord.id, nextSortOrder + 1);
    }

    const generatedBeginnerExplanation = normalizeGeneratedExplanation(suggestion.beginnerExplanation);
    const generatedExpertExplanation = normalizeGeneratedExplanation(suggestion.expertExplanation);
    const nextExplanationUpdate = explanationUpdates.get(sourceWord.id) ?? {};

    if (generatedBeginnerExplanation && !sourceWord.beginnerExplanation?.trim()) {
      nextExplanationUpdate.beginnerExplanation = generatedBeginnerExplanation;
    }

    if (generatedExpertExplanation && !sourceWord.expertExplanation?.trim()) {
      nextExplanationUpdate.expertExplanation = generatedExpertExplanation;
    }

    if (nextExplanationUpdate.beginnerExplanation || nextExplanationUpdate.expertExplanation) {
      explanationUpdates.set(sourceWord.id, nextExplanationUpdate);
    }

    for (const relation of uniqueBy(
      (suggestion.relations ?? []).filter((item) => item.targetWordId !== sourceWord.id),
      (item) => `${item.targetWordId}:${item.relationType}`
    )) {
      if (!catalogWordIdSet.has(relation.targetWordId)) {
        continue;
      }

      const relationKey = buildRelationEquivalenceKey(sourceWord.id, relation.targetWordId, relation.relationType);

      if (seenRelationKeys.has(relationKey)) {
        continue;
      }

      relationRows.push({
        fromWordId: sourceWord.id,
        toWordId: relation.targetWordId,
        relationType: relation.relationType,
        isBidirectional: true
      });
      seenRelationKeys.add(relationKey);
    }
  }

  let addedCategoryAssignments = 0;
  let addedRelations = 0;
  let addedBeginnerExplanations = 0;
  let addedExpertExplanations = 0;

  if (categoryAssignments.length > 0) {
    const result = await prisma.wordCategory.createMany({
      data: categoryAssignments,
      skipDuplicates: true
    });
    addedCategoryAssignments = result.count;
  }

  if (relationRows.length > 0) {
    const result = await prisma.relation.createMany({
      data: relationRows,
      skipDuplicates: true
    });
    addedRelations = result.count;
  }

  if (explanationUpdates.size > 0) {
    const updates = Array.from(explanationUpdates.entries());

    addedBeginnerExplanations = updates.filter(([, data]) => Boolean(data.beginnerExplanation)).length;
    addedExpertExplanations = updates.filter(([, data]) => Boolean(data.expertExplanation)).length;

    await prisma.$transaction(
      updates.map(([wordId, data]) =>
        prisma.word.update({
          where: { id: wordId },
          data
        })
      )
    );
  }

  return {
    addedCategoryAssignments,
    addedRelations,
    addedBeginnerExplanations,
    addedExpertExplanations
  };
}

export async function enrichVocabularyCatalogWithAI(options: {
  onProgress?: (event: CatalogEnrichmentProgressEvent) => Promise<void> | void;
} = {}): Promise<CatalogEnrichmentResult> {
  const totalWords = await prisma.word.count();

  if (!isOpenAIConfigured()) {
    return {
      skipped: true,
      processedWords: totalWords,
      addedCategoryAssignments: 0,
      addedRelations: 0,
      addedBeginnerExplanations: 0,
      addedExpertExplanations: 0,
      warning: "AI enrichment skipped because OPENAI_API_KEY is not set."
    };
  }

  if (totalWords === 0) {
    return {
      skipped: false,
      processedWords: 0,
      addedCategoryAssignments: 0,
      addedRelations: 0,
      addedBeginnerExplanations: 0,
      addedExpertExplanations: 0
    };
  }

  const [categories, catalogSummaryWords, existingRelations] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true
      }
    }),
    prisma.word.findMany({
      orderBy: [{ lemma: "asc" }],
      select: aiCatalogSummaryWordSelect
    }),
    prisma.relation.findMany({
      where: {
        relationType: {
          in: [...AI_RELATION_TYPE_VALUES]
        }
      },
      select: {
        fromWordId: true,
        toWordId: true,
        relationType: true
      }
    })
  ]);

  const categoryPromptContext = buildCategoryPromptContext(categories);
  const catalogSummary = buildCatalogSummary(catalogSummaryWords);
  const catalogWordIdSet = new Set(catalogSummary.map((word) => word.id));
  const categoryBySlug = new Map(categories.map((category) => [category.slug, { id: category.id, slug: category.slug }]));
  const seenRelationKeys = new Set(
    existingRelations.map((relation) =>
      buildRelationEquivalenceKey(
        relation.fromWordId,
        relation.toWordId,
        relation.relationType as (typeof AI_RELATION_TYPE_VALUES)[number]
      )
    )
  );
  const totalBatches = Math.ceil(totalWords / ENRICHMENT_BATCH_SIZE);

  if (totalBatches > 0) {
    await options.onProgress?.({
      completed: 0,
      total: totalBatches,
      status: `Preparing AI enrichment for ${totalWords} word${totalWords === 1 ? "" : "s"}.`
    });
  }

  let addedCategoryAssignments = 0;
  let addedRelations = 0;
  let addedBeginnerExplanations = 0;
  let addedExpertExplanations = 0;
  let processedWords = 0;
  let completedBatches = 0;
  let cursor: string | undefined;

  while (processedWords < totalWords) {
    const batch = await prisma.word.findMany({
      orderBy: [{ id: "asc" }],
      take: ENRICHMENT_BATCH_SIZE,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {}),
      select: aiFocusWordSelect
    });

    if (batch.length === 0) {
      break;
    }

    cursor = batch.at(-1)?.id;

    await options.onProgress?.({
      completed: completedBatches,
      total: totalBatches,
      status: `Running AI enrichment batch ${completedBatches + 1} of ${totalBatches}.`
    });

    const parsed = await generateCatalogEnrichmentForBatch({
      categories: categoryPromptContext,
      catalogSummary,
      batch
    });

    const applied = await applyCatalogEnrichmentSuggestions({
      batchWords: batch,
      suggestions: (parsed.words ?? []).map((word) => ({
        wordId: word.wordId,
        categorySlugs: word.categorySlugs ?? [],
        beginnerExplanation: word.beginnerExplanation ?? "",
        expertExplanation: word.expertExplanation ?? "",
        relations: (word.relations ?? []).map((relation) => ({
          targetWordId: relation.targetWordId,
          relationType: relation.relationType,
          rationale: relation.rationale ?? ""
        }))
      })),
      categoryBySlug,
      catalogWordIdSet,
      seenRelationKeys
    });

    addedCategoryAssignments += applied.addedCategoryAssignments;
    addedRelations += applied.addedRelations;
    addedBeginnerExplanations += applied.addedBeginnerExplanations;
    addedExpertExplanations += applied.addedExpertExplanations;
    processedWords += batch.length;
    completedBatches += 1;
  }

  if (totalBatches > 0) {
    await options.onProgress?.({
      completed: completedBatches,
      total: totalBatches,
      status: `Finished AI analysis for ${processedWords} word${processedWords === 1 ? "" : "s"}.`
    });
  }

  return {
    skipped: false,
    processedWords,
    addedCategoryAssignments,
    addedRelations,
    addedBeginnerExplanations,
    addedExpertExplanations
  };
}

export async function generateLessonPlanForCategory(categorySlug: string) {
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    include: {
      words: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          word: {
            select: {
              id: true,
              lemma: true,
              syllabics: true,
              plainEnglish: true,
              partOfSpeech: true,
              linguisticClass: true,
              beginnerExplanation: true,
              expertExplanation: true,
              source: true,
              notes: true,
              meanings: {
                orderBy: [{ sortOrder: "asc" }],
                select: {
                  gloss: true,
                  description: true
                }
              },
              categories: {
                orderBy: [{ sortOrder: "asc" }],
                select: {
                  category: {
                    select: {
                      name: true,
                      slug: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!category) {
    throw new Error("Theme not found.");
  }

  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not set. Add it before generating lesson plans.");
  }

  const words = category.words.map((entry) => entry.word);

  if (words.length === 0) {
    throw new Error("This theme does not have enough words yet to build a lesson plan.");
  }

  const plan = await generateStructuredObject({
    task: "lessonPlan",
    schema: lessonPlanSchema,
    schemaName: "theme_lesson_plan",
    reasoningEffort: "medium",
    instructions: [
      "You are helping a teacher create a classroom-ready lesson plan.",
      "Ground the plan only in the theme information and the supplied vocabulary records.",
      "Do not invent new vocabulary items or grammatical facts that are not supported by the input.",
      "Make the plan practical for a single class session and teacher-friendly.",
      "Include concrete activity ideas that use the provided Cree vocabulary."
    ].join("\n"),
    input: JSON.stringify(
      {
        theme: {
          name: category.name,
          slug: category.slug,
          description: category.description
        },
        words: words.map((word) => ({
          lemma: word.lemma,
          syllabics: word.syllabics,
          plainEnglish: word.plainEnglish,
          partOfSpeech: word.partOfSpeech,
          linguisticClass: word.linguisticClass,
          beginnerExplanation: word.beginnerExplanation,
          expertExplanation: word.expertExplanation,
          source: word.source,
          notes: word.notes,
          meanings: word.meanings,
          relatedThemes: word.categories.map((entry) => entry.category.name)
        }))
      },
      null,
      2
    )
  });

  return {
    category: {
      name: category.name,
      slug: category.slug,
      description: category.description
    },
    plan,
    wordCount: words.length
  };
}

export async function generateFlashcardDeck(wordIds: string[]) {
  const words = await prisma.word.findMany({
    where: {
      id: {
        in: wordIds
      }
    },
    select: {
      id: true,
      lemma: true,
      syllabics: true,
      plainEnglish: true,
      partOfSpeech: true,
      beginnerExplanation: true,
      expertExplanation: true,
      meanings: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          gloss: true,
          description: true
        }
      },
      categories: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          category: {
            select: {
              name: true,
              slug: true
            }
          }
        }
      }
    }
  });

  if (words.length === 0) {
    throw new Error("No saved words were found in the database for this flashcard request.");
  }

  const orderedWords = wordIds
    .map((wordId) => words.find((word) => word.id === wordId))
    .filter((word): word is (typeof words)[number] => Boolean(word));

  if (!isOpenAIConfigured()) {
    return {
      deck: buildFallbackFlashcardDeck(orderedWords),
      usedFallback: true
    };
  }

  const generatedDeck = await generateStructuredObject({
    task: "flashcards",
    schema: flashcardDeckSchema,
    schemaName: "study_flashcard_deck",
    reasoningEffort: "low",
    instructions: [
      "Create a concise flashcard deck to help a learner study Plains Cree vocabulary.",
      "Return one flashcard per provided word ID.",
      "Keep the front brief and memorable.",
      "Use the back for meaning and a short study explanation.",
      "Use the hint and practicePrompt to support recall and active practice.",
      "Ground everything in the supplied vocabulary data."
    ].join("\n"),
    input: JSON.stringify(
      {
        savedWords: orderedWords.map((word) => ({
          wordId: word.id,
          lemma: word.lemma,
          syllabics: word.syllabics,
          plainEnglish: word.plainEnglish,
          partOfSpeech: word.partOfSpeech,
          beginnerExplanation: word.beginnerExplanation,
          expertExplanation: word.expertExplanation,
          meanings: word.meanings,
          categories: word.categories.map((entry) => entry.category.name)
        }))
      },
      null,
      2
    )
  });

  const fallbackDeck = buildFallbackFlashcardDeck(orderedWords);
  const fallbackCardByWordId = new Map(fallbackDeck.cards.map((card) => [card.wordId, card]));
  const generatedCardByWordId = new Map(generatedDeck.cards.map((card) => [card.wordId, card]));
  const completedCards = orderedWords.map((word) => generatedCardByWordId.get(word.id) ?? fallbackCardByWordId.get(word.id));

  return {
    deck: {
      title: generatedDeck.title,
      studyTip: generatedDeck.studyTip,
      cards: completedCards.filter(
        (card): card is NonNullable<(typeof completedCards)[number]> => Boolean(card)
      )
    },
    usedFallback: false
  };
}

export async function answerSearchQuestion(question: string, contextWords: SearchQuestionContextWord[]) {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not set. Add it before using AI search answers.");
  }

  if (contextWords.length === 0) {
    throw new Error("At least one local vocabulary entry is required to answer a search question.");
  }

  return generateStructuredObject({
    task: "searchQuestion",
    schema: searchQuestionAnswerSchema,
    schemaName: "search_question_answer",
    reasoningEffort: "medium",
    instructions: [
      "You are helping a learner ask dictionary-style questions about Plains Cree words.",
      "Answer using only the supplied local vocabulary records.",
      "Do not invent meanings, grammatical facts, or paradigm details that are not supported by the input.",
      "If the supplied records are not enough to answer clearly, set status to insufficient_context.",
      "Keep the answer concise, learner-friendly, and grounded in the provided word data.",
      "Only include matchedWordIds that appear in the supplied records."
    ].join("\n"),
    input: JSON.stringify(
      {
        question,
        records: contextWords.map((word) => ({
          id: word.id,
          slug: word.slug,
          lemma: word.lemma,
          syllabics: word.syllabics,
          plainEnglish: word.plainEnglish,
          partOfSpeech: word.partOfSpeech,
          linguisticClass: word.linguisticClass,
          rootStem: word.rootStem,
          beginnerExplanation: word.beginnerExplanation,
          expertExplanation: word.expertExplanation,
          notes: word.notes,
          source: word.source,
          categories: word.categories,
          itwewinaMetadata: word.itwewinaMetadata,
          meanings: word.meanings,
          morphologyTables: word.morphologyTables.map((table) => ({
            title: table.title,
            description: table.description,
            isPlainEnglish: table.isPlainEnglish,
            entryCount: table.entries.length,
            sampleEntries: table.entries.slice(0, 18)
          }))
        }))
      },
      null,
      2
    )
  });
}
