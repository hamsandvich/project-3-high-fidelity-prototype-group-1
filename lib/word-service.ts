import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import { emptyToUndefined, normalizeLineBreaks, slugify, uniqueBy } from "@/lib/utils";
import { wordFormSchema } from "@/lib/validators";
import type { RelationInput, WordFormPayload } from "@/types";

export function createEmptyWordPayload(): WordFormPayload {
  return {
    lemma: "",
    syllabics: "",
    plainEnglish: "",
    partOfSpeech: "",
    linguisticClass: "",
    rootStem: "",
    pronunciation: "",
    audioUrl: "",
    source: "",
    notes: "",
    itwewinaMetadata: undefined,
    beginnerExplanation: "",
    expertExplanation: "",
    meanings: [
      {
        gloss: "",
        description: "",
        sortOrder: 0
      }
    ],
    categoryIds: [],
    morphologyTables: [],
    relations: []
  };
}

function normalizePayload(payload: WordFormPayload) {
  const parsed = wordFormSchema.parse(payload);

  const meanings = uniqueBy(
    parsed.meanings
      .filter((meaning) => meaning.gloss.trim().length > 0)
      .map((meaning, index) => ({
        gloss: meaning.gloss.trim(),
        description: emptyToUndefined(meaning.description),
        sortOrder: index
      })),
    (meaning) => `${meaning.gloss.toLowerCase()}::${meaning.description ?? ""}`
  );

  if (!meanings.some((meaning) => meaning.gloss.toLowerCase() === parsed.plainEnglish.trim().toLowerCase())) {
    meanings.unshift({
      gloss: parsed.plainEnglish.trim(),
      description: "Primary gloss",
      sortOrder: 0
    });
  }

  const normalizedMeanings = meanings.map((meaning, index) => ({
    ...meaning,
    sortOrder: index
  }));

  const normalizedTables = parsed.morphologyTables
    .filter((table) => table.title.trim().length > 0)
    .map((table, tableIndex) => ({
      title: table.title.trim(),
      description: emptyToUndefined(table.description),
      isPlainEnglish: table.isPlainEnglish,
      sortOrder: tableIndex,
      entries: table.entries
        .filter((entry) => entry.rowLabel.trim().length > 0 && entry.value.trim().length > 0)
        .map((entry, entryIndex) => ({
          rowLabel: entry.rowLabel.trim(),
          columnLabel: emptyToUndefined(entry.columnLabel),
          plainLabel: emptyToUndefined(entry.plainLabel),
          value: entry.value.trim(),
          sortOrder: entryIndex
        }))
    }))
    .filter((table) => table.entries.length > 0);

  const normalizedRelations = uniqueBy(
    parsed.relations
      .filter((relation) => relation.toWordId.trim().length > 0)
      .map((relation) => ({
        toWordId: relation.toWordId,
        relationType: relation.relationType,
        label: emptyToUndefined(relation.label),
        isBidirectional: relation.isBidirectional
      })),
    (relation) => `${relation.toWordId}:${relation.relationType}`
  );

  return {
    ...parsed,
    lemma: parsed.lemma.trim(),
    syllabics: emptyToUndefined(parsed.syllabics),
    plainEnglish: parsed.plainEnglish.trim(),
    partOfSpeech: parsed.partOfSpeech.trim(),
    linguisticClass: emptyToUndefined(parsed.linguisticClass),
    rootStem: emptyToUndefined(parsed.rootStem),
    pronunciation: emptyToUndefined(parsed.pronunciation),
    audioUrl: emptyToUndefined(parsed.audioUrl),
    source: emptyToUndefined(parsed.source),
    notes: emptyToUndefined(normalizeLineBreaks(parsed.notes)),
    itwewinaMetadata: parsed.itwewinaMetadata,
    beginnerExplanation: emptyToUndefined(normalizeLineBreaks(parsed.beginnerExplanation)),
    expertExplanation: emptyToUndefined(normalizeLineBreaks(parsed.expertExplanation)),
    meanings: normalizedMeanings,
    categoryIds: uniqueBy(parsed.categoryIds.filter(Boolean), (item) => item),
    morphologyTables: normalizedTables,
    relations: normalizedRelations
  };
}

async function ensureUniqueSlug(
  tx: Prisma.TransactionClient,
  source: string,
  currentWordId?: string
) {
  const baseSlug = slugify(source) || "word-entry";
  let candidate = baseSlug;
  let counter = 2;

  while (true) {
    const existing = await tx.word.findFirst({
      where: {
        slug: candidate,
        ...(currentWordId ? { NOT: { id: currentWordId } } : {})
      },
      select: { id: true }
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

function buildWordCoreData(payload: ReturnType<typeof normalizePayload>, slug: string) {
  return {
    lemma: payload.lemma,
    syllabics: payload.syllabics,
    slug,
    plainEnglish: payload.plainEnglish,
    partOfSpeech: payload.partOfSpeech,
    linguisticClass: payload.linguisticClass,
    rootStem: payload.rootStem,
    pronunciation: payload.pronunciation,
    audioUrl: payload.audioUrl,
    source: payload.source,
    notes: payload.notes,
    ...(payload.itwewinaMetadata
      ? {
          itwewinaMetadata: payload.itwewinaMetadata as Prisma.InputJsonValue
        }
      : {}),
    beginnerExplanation: payload.beginnerExplanation,
    expertExplanation: payload.expertExplanation,
    isDemo: false,
    meanings: {
      create: payload.meanings.map((meaning) => ({
        gloss: meaning.gloss,
        description: meaning.description,
        sortOrder: meaning.sortOrder
      }))
    },
    categories: {
      create: payload.categoryIds.map((categoryId, index) => ({
        categoryId,
        sortOrder: index
      }))
    },
    morphologyTables: {
      create: payload.morphologyTables.map((table) => ({
        title: table.title,
        description: table.description,
        isPlainEnglish: table.isPlainEnglish,
        sortOrder: table.sortOrder,
        entries: {
          create: table.entries.map((entry) => ({
            rowLabel: entry.rowLabel,
            columnLabel: entry.columnLabel,
            plainLabel: entry.plainLabel,
            value: entry.value,
            sortOrder: entry.sortOrder
          }))
        }
      }))
    }
  } satisfies Prisma.WordCreateInput;
}

export async function saveWordCore(payload: WordFormPayload, existingWordId?: string) {
  const normalized = normalizePayload(payload);

  return prisma.$transaction(async (tx) => {
    const slug = await ensureUniqueSlug(tx, normalized.lemma, existingWordId);

    if (existingWordId) {
      await tx.wordMeaning.deleteMany({ where: { wordId: existingWordId } });
      await tx.wordCategory.deleteMany({ where: { wordId: existingWordId } });
      await tx.morphologyTable.deleteMany({ where: { wordId: existingWordId } });

      return tx.word.update({
        where: { id: existingWordId },
        data: buildWordCoreData(normalized, slug)
      });
    }

    return tx.word.create({
      data: buildWordCoreData(normalized, slug)
    });
  });
}

export async function replaceWordRelations(wordId: string, relations: RelationInput[]) {
  const sanitized = uniqueBy(
    relations
      .filter((relation) => relation.toWordId && relation.toWordId !== wordId)
      .map((relation) => ({
        fromWordId: wordId,
        toWordId: relation.toWordId,
        relationType: relation.relationType,
        label: emptyToUndefined(relation.label),
        isBidirectional: relation.isBidirectional
      })),
    (relation) => `${relation.toWordId}:${relation.relationType}`
  );

  return prisma.$transaction(async (tx) => {
    await tx.relation.deleteMany({
      where: { fromWordId: wordId }
    });

    if (sanitized.length > 0) {
      await tx.relation.createMany({
        data: sanitized
      });
    }
  });
}

export async function saveWord(payload: WordFormPayload, existingWordId?: string) {
  const savedWord = await saveWordCore(payload, existingWordId);
  await replaceWordRelations(savedWord.id, payload.relations);
  return savedWord;
}

export async function deleteWord(wordId: string) {
  await prisma.word.delete({
    where: { id: wordId }
  });
}
