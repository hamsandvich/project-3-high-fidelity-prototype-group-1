import type { Prisma } from "@/generated/prisma/client";
import { slugify } from "@/lib/utils";

type SearchRankableMeaning = {
  gloss: string | null | undefined;
};

export type SearchRankableWord = {
  id: string;
  slug: string;
  lemma: string;
  syllabics?: string | null;
  plainEnglish: string;
  notes?: string | null;
  meanings?: SearchRankableMeaning[] | null;
};

type SearchFieldWeights = {
  exact: number;
  prefix: number;
  word: number;
  contains: number;
};

const HEADWORD_FIELD_WEIGHTS: SearchFieldWeights = {
  exact: 1_200,
  prefix: 920,
  word: 840,
  contains: 700
};

const ENGLISH_FIELD_WEIGHTS: SearchFieldWeights = {
  exact: 1_050,
  prefix: 820,
  word: 740,
  contains: 600
};

const GLOSS_FIELD_WEIGHTS: SearchFieldWeights = {
  exact: 980,
  prefix: 780,
  word: 700,
  contains: 560
};

const NOTES_FIELD_WEIGHTS: SearchFieldWeights = {
  exact: 260,
  prefix: 200,
  word: 160,
  contains: 110
};

function normalizeSearchText(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-CA") ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWholeWordMatch(value: string, query: string) {
  if (!value || !query) {
    return false;
  }

  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escapeRegExp(query)}(?=$|[^\\p{L}\\p{M}\\p{N}])`, "u").test(
    value
  );
}

function hasSlugTokenMatch(value: string, query: string) {
  if (!value || !query) {
    return false;
  }

  return new RegExp(`(^|-)${escapeRegExp(query)}(?=$|-)`).test(value);
}

function getPositionBonus(matchIndex: number) {
  if (matchIndex < 0) {
    return 0;
  }

  return Math.max(0, 18 - Math.min(18, matchIndex * 2));
}

function getLengthBonus(value: string, query: string) {
  return Math.max(0, 16 - Math.min(16, Math.max(0, value.length - query.length)));
}

function getFieldMatchScore(
  value: string | null | undefined,
  queryText: string,
  querySlug: string,
  weights: SearchFieldWeights
) {
  const normalizedValue = normalizeSearchText(value);

  if (!normalizedValue) {
    return 0;
  }

  const normalizedValueSlug = slugify(value ?? "");
  let score = 0;

  if (normalizedValue === queryText) {
    score = Math.max(score, weights.exact);
  }

  if (querySlug && normalizedValueSlug === querySlug) {
    score = Math.max(score, weights.exact - 12);
  }

  if (normalizedValue.startsWith(queryText)) {
    score = Math.max(score, weights.prefix);
  }

  if (querySlug && normalizedValueSlug.startsWith(querySlug)) {
    score = Math.max(score, weights.prefix - 10);
  }

  if (hasWholeWordMatch(normalizedValue, queryText)) {
    score = Math.max(score, weights.word);
  }

  if (querySlug && hasSlugTokenMatch(normalizedValueSlug, querySlug)) {
    score = Math.max(score, weights.word - 10);
  }

  const containsIndex = normalizedValue.indexOf(queryText);
  if (containsIndex >= 0) {
    score = Math.max(score, weights.contains + getPositionBonus(containsIndex));
  }

  const slugContainsIndex = querySlug ? normalizedValueSlug.indexOf(querySlug) : -1;
  if (slugContainsIndex >= 0) {
    score = Math.max(score, weights.contains - 12 + getPositionBonus(slugContainsIndex));
  }

  if (score === 0) {
    return 0;
  }

  return score + getLengthBonus(normalizedValue, queryText);
}

export function buildWordSearchWhere(query: string): Prisma.WordWhereInput {
  const normalized = query.trim();
  const normalizedSlug = slugify(normalized);

  return {
    OR: [
      { lemma: { contains: normalized, mode: "insensitive" } },
      { syllabics: { contains: normalized, mode: "insensitive" } },
      { plainEnglish: { contains: normalized, mode: "insensitive" } },
      { notes: { contains: normalized, mode: "insensitive" } },
      ...(normalizedSlug ? [{ slug: { contains: normalizedSlug } }] : []),
      {
        meanings: {
          some: {
            gloss: {
              contains: normalized,
              mode: "insensitive"
            }
          }
        }
      }
    ]
  };
}

export function buildExactWordSearchWhere(query: string): Prisma.WordWhereInput {
  const normalized = query.trim();
  const normalizedSlug = slugify(normalized);

  return {
    OR: [
      { lemma: { equals: normalized, mode: "insensitive" } },
      { syllabics: { equals: normalized, mode: "insensitive" } },
      { plainEnglish: { equals: normalized, mode: "insensitive" } },
      ...(normalizedSlug ? [{ slug: { equals: normalizedSlug } }] : []),
      {
        meanings: {
          some: {
            gloss: {
              equals: normalized,
              mode: "insensitive"
            }
          }
        }
      }
    ]
  };
}

export function scoreWordSearchMatch(word: SearchRankableWord, query: string) {
  const queryText = normalizeSearchText(query);

  if (!queryText) {
    return 0;
  }

  const querySlug = slugify(query);
  const headwordScore = Math.max(
    getFieldMatchScore(word.lemma, queryText, querySlug, HEADWORD_FIELD_WEIGHTS),
    getFieldMatchScore(word.syllabics, queryText, querySlug, HEADWORD_FIELD_WEIGHTS)
  );
  const englishScore = getFieldMatchScore(word.plainEnglish, queryText, querySlug, ENGLISH_FIELD_WEIGHTS);
  const glossScore = Math.max(
    0,
    ...(word.meanings ?? []).map((meaning) => getFieldMatchScore(meaning.gloss, queryText, querySlug, GLOSS_FIELD_WEIGHTS))
  );
  const notesScore = getFieldMatchScore(word.notes, queryText, querySlug, NOTES_FIELD_WEIGHTS);
  let score = headwordScore + englishScore + glossScore + notesScore;

  if (headwordScore > 0) {
    score += 48;
  }

  if (headwordScore > 0 && englishScore > 0) {
    score += 16;
  }

  if (englishScore > 0 && glossScore > 0) {
    score += 20;
  }

  return score;
}

export function rankWordSearchResults<TWord extends SearchRankableWord>(words: TWord[], query: string) {
  return words
    .map((word) => ({
      word,
      score: scoreWordSearchMatch(word, query)
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.word.lemma.localeCompare(right.word.lemma) ||
        left.word.plainEnglish.localeCompare(right.word.plainEnglish)
    )
    .map(({ word }) => word);
}
