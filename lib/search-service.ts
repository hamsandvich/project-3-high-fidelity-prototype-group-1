import { Prisma } from "@/generated/prisma/client";
import { unstable_noStore as noStore } from "next/cache";

import { answerSearchQuestion, type SearchQuestionContextWord } from "@/lib/ai";
import { importWords } from "@/lib/importers";
import { buildItwewinaImportBatch } from "@/lib/itwewina";
import { isOpenAIConfigured } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import {
  buildExactWordSearchWhere,
  buildWordSearchWhere,
  rankWordSearchResults,
  scoreWordSearchMatch,
  type SearchRankableWord
} from "@/lib/search";
import { slugify, uniqueBy } from "@/lib/utils";
import type { ItwewinaMetadata } from "@/types";
import type { WordCardModel } from "@/types/view-models";

const QUESTION_PREFIX_PATTERN =
  /^(what|how|why|when|where|who|which|is|are|can|could|would|does|do|did|tell me|explain|describe|show me)\b/i;
const QUESTION_HINT_PATTERN =
  /\b(grammatical|grammar|form|meaning|mean|means|translation|translate|pronounce|pronunciation|part of speech|linguistic|morphology|morphological|plural|tense|stem)\b/i;
const QUESTION_LOOKUP_TOKEN_PATTERN = /[\p{L}\p{M}\p{N}'’-]+/gu;
const QUOTED_PHRASE_PATTERN = /["“”'‘’]([^"“”'‘’]{2,})["“”'‘’]/g;
const CONNECTOR_PHRASE_PATTERN = /\b(?:of|for|about)\s+([\p{L}\p{M}\p{N}'’-]+(?:\s+[\p{L}\p{M}\p{N}'’-]+){0,2})/giu;
const QUESTION_STOPWORDS = new Set([
  "a",
  "an",
  "about",
  "are",
  "can",
  "could",
  "describe",
  "did",
  "do",
  "does",
  "english",
  "explain",
  "for",
  "form",
  "grammatical",
  "grammar",
  "how",
  "in",
  "is",
  "linguistic",
  "meaning",
  "means",
  "me",
  "morphological",
  "morphology",
  "of",
  "part",
  "plural",
  "pronounce",
  "pronunciation",
  "say",
  "show",
  "speech",
  "stem",
  "tell",
  "tense",
  "the",
  "this",
  "to",
  "translate",
  "translation",
  "what",
  "word",
  "would"
]);
const QUESTION_MATCH_LIMIT = 5;
const QUESTION_CONTEXT_LIMIT = 3;
const LOOKUP_RESULT_LIMIT = 50;
const LOOKUP_CANDIDATE_LIMIT = 250;
const QUESTION_CANDIDATE_LIMIT = 50;

const wordCardSelect = {
  id: true,
  slug: true,
  lemma: true,
  syllabics: true,
  plainEnglish: true,
  partOfSpeech: true,
  categories: {
    orderBy: { sortOrder: "asc" },
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          colorToken: true
        }
      }
    }
  }
} satisfies Prisma.WordSelect;

const searchResultWordSelect = {
  ...wordCardSelect,
  notes: true,
  meanings: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      gloss: true
    }
  }
} satisfies Prisma.WordSelect;

const questionContextWordSelect = {
  ...wordCardSelect,
  linguisticClass: true,
  rootStem: true,
  beginnerExplanation: true,
  expertExplanation: true,
  notes: true,
  source: true,
  itwewinaMetadata: true,
  meanings: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      gloss: true,
      description: true
    }
  },
  morphologyTables: {
    orderBy: [{ sortOrder: "asc" }],
    select: {
      title: true,
      description: true,
      isPlainEnglish: true,
      entries: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          rowLabel: true,
          columnLabel: true,
          plainLabel: true,
          value: true
        }
      }
    }
  }
} satisfies Prisma.WordSelect;

type SearchResultWord = Prisma.WordGetPayload<{ select: typeof searchResultWordSelect }>;
type QuestionContextWordRecord = Prisma.WordGetPayload<{ select: typeof questionContextWordSelect }>;

export type SearchImportResult =
  | {
      status: "existing";
      importedCount: 0;
    }
  | {
      status: "not_found";
      importedCount: 0;
      warnings?: string[];
    }
  | {
      status: "imported";
      importedCount: number;
      warnings?: string[];
    };

export type SearchQuestionAnswerState =
  | {
      status: "answered";
      answer: string;
      matchedWordIds: string[];
    }
  | {
      status: "unavailable";
      reason: "missing_api_key" | "no_local_match" | "insufficient_context" | "ai_error";
      message: string;
    };

export type SearchExperience = {
  mode: "lookup" | "question";
  lookupTerm: string | null;
  results: WordCardModel[];
  questionAnswer: SearchQuestionAnswerState | null;
};

function mapWordToCard(word: SearchResultWord): WordCardModel {
  return {
    id: word.id,
    slug: word.slug,
    lemma: word.lemma,
    syllabics: word.syllabics,
    plainEnglish: word.plainEnglish,
    partOfSpeech: word.partOfSpeech,
    categories: word.categories
  };
}

async function findRankedWordMatches<TWord extends SearchRankableWord>(params: {
  query: string;
  limit: number;
  fetchExact: () => Promise<TWord[]>;
  fetchBroad: () => Promise<TWord[]>;
}) {
  const [exactMatches, broadMatches] = await Promise.all([params.fetchExact(), params.fetchBroad()]);

  return rankWordSearchResults(
    uniqueBy([...exactMatches, ...broadMatches], (word) => word.id),
    params.query
  ).slice(0, params.limit);
}

async function findLookupWords(query: string) {
  return findRankedWordMatches({
    query,
    limit: LOOKUP_RESULT_LIMIT,
    fetchExact: () =>
      prisma.word.findMany({
        where: buildExactWordSearchWhere(query),
        select: searchResultWordSelect,
        take: LOOKUP_RESULT_LIMIT
      }),
    fetchBroad: () =>
      prisma.word.findMany({
        where: buildWordSearchWhere(query),
        orderBy: [{ lemma: "asc" }],
        select: searchResultWordSelect,
        take: LOOKUP_CANDIDATE_LIMIT
      })
  });
}

function looksLikeQuestion(query: string) {
  const normalized = query.trim();

  if (!normalized) {
    return false;
  }

  if (normalized.endsWith("?")) {
    return true;
  }

  const tokenCount = normalized.split(/\s+/).length;

  if (tokenCount >= 4 && QUESTION_PREFIX_PATTERN.test(normalized)) {
    return true;
  }

  return tokenCount >= 4 && QUESTION_HINT_PATTERN.test(normalized);
}

function normalizeLookupTerm(value: string) {
  return value.trim().replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
}

function scoreLookupTerm(term: string) {
  const normalized = term.toLocaleLowerCase("en-CA");

  if (!normalized) {
    return -1;
  }

  let score = 0;

  if (/[^\u0000-\u007F]/.test(term)) {
    score += 6;
  }

  if (term.length >= 5) {
    score += 3;
  }

  if (!QUESTION_STOPWORDS.has(normalized)) {
    score += 4;
  }

  return score;
}

function extractQuestionLookupTerms(query: string) {
  const quotedPhrases = [...query.matchAll(QUOTED_PHRASE_PATTERN)]
    .map((match) => normalizeLookupTerm(match[1] ?? ""))
    .filter(Boolean);

  const connectorPhrases = [...query.matchAll(CONNECTOR_PHRASE_PATTERN)]
    .map((match) => normalizeLookupTerm(match[1] ?? ""))
    .filter(Boolean);

  const scoredTokens = (query.match(QUESTION_LOOKUP_TOKEN_PATTERN) ?? [])
    .map((token, index) => ({
      term: normalizeLookupTerm(token),
      index
    }))
    .filter((item) => Boolean(item.term))
    .sort((left, right) => {
      const scoreDifference = scoreLookupTerm(right.term) - scoreLookupTerm(left.term);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.index - right.index;
    })
    .map((item) => item.term)
    .filter((term) => !QUESTION_STOPWORDS.has(term.toLocaleLowerCase("en-CA")) || /[^\u0000-\u007F]/.test(term));

  return uniqueBy([...quotedPhrases, ...connectorPhrases, ...scoredTokens], (term) => slugify(term) || term.toLowerCase())
    .filter(Boolean)
    .slice(0, QUESTION_MATCH_LIMIT);
}

function scoreQuestionWordMatch(word: QuestionContextWordRecord, term: string, termIndex: number) {
  let score = scoreWordSearchMatch(word, term);
  score += Math.max(0, QUESTION_MATCH_LIMIT - termIndex) * 24;

  if (word.linguisticClass || word.rootStem || word.morphologyTables.length > 0) {
    score += 24;
  }

  return score;
}

async function findQuestionContextWords(terms: string[]) {
  const searches = await Promise.all(
    terms.map(async (term, termIndex) => {
      const matches = await findRankedWordMatches({
        query: term,
        limit: QUESTION_MATCH_LIMIT,
        fetchExact: () =>
          prisma.word.findMany({
            where: buildExactWordSearchWhere(term),
            select: questionContextWordSelect,
            take: QUESTION_MATCH_LIMIT
          }),
        fetchBroad: () =>
          prisma.word.findMany({
            where: buildWordSearchWhere(term),
            orderBy: [{ lemma: "asc" }],
            select: questionContextWordSelect,
            take: QUESTION_CANDIDATE_LIMIT
          })
      });

      return matches.map((word) => ({
        word,
        score: scoreQuestionWordMatch(word, term, termIndex)
      }));
    })
  );

  return uniqueBy(
    searches
      .flat()
      .sort((left, right) => right.score - left.score || left.word.lemma.localeCompare(right.word.lemma)),
    (item) => item.word.id
  )
    .map((item) => item.word)
    .slice(0, QUESTION_MATCH_LIMIT);
}

function mapWordToQuestionContext(word: QuestionContextWordRecord): SearchQuestionContextWord {
  return {
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
    itwewinaMetadata: (word.itwewinaMetadata as ItwewinaMetadata | null | undefined) ?? null,
    categories: word.categories.map((entry) => entry.category.name),
    meanings: word.meanings,
    morphologyTables: word.morphologyTables
  };
}

function getMissingMatchMessage(lookupTerm: string | null) {
  if (lookupTerm) {
    return `I could not find a local entry for "${lookupTerm}" yet. Search can import that word from Itwêwina, then answer the question from the saved dictionary data.`;
  }

  return "Ask about a specific Cree or English word so search can ground the answer in a local dictionary entry.";
}

export async function importSearchTermFromItwewina(query: string): Promise<SearchImportResult> {
  const normalized = query.trim();

  if (!normalized) {
    throw new Error("Search query is required.");
  }

  const existingWord = await prisma.word.findFirst({
    where: buildWordSearchWhere(normalized),
    select: { id: true }
  });

  if (existingWord) {
    return {
      status: "existing",
      importedCount: 0
    };
  }

  const parsed = await buildItwewinaImportBatch(normalized);

  if (parsed.words.length === 0) {
    return {
      status: "not_found",
      importedCount: 0,
      warnings: parsed.warnings.length > 0 ? parsed.warnings : undefined
    };
  }

  const result = await importWords(parsed.words);

  return {
    status: "imported",
    importedCount: result.importedCount,
    warnings: parsed.warnings.length > 0 ? parsed.warnings : undefined
  };
}

export async function getSearchExperience(query: string): Promise<SearchExperience> {
  noStore();

  const normalized = query.trim();

  if (!normalized) {
    return {
      mode: "lookup",
      lookupTerm: null,
      results: [],
      questionAnswer: null
    };
  }

  if (!looksLikeQuestion(normalized)) {
    const results = await findLookupWords(normalized);

    return {
      mode: "lookup",
      lookupTerm: normalized,
      results: results.map(mapWordToCard),
      questionAnswer: null
    };
  }

  const lookupTerms = extractQuestionLookupTerms(normalized);
  const lookupTerm = lookupTerms[0] ?? null;
  const contextWords = await findQuestionContextWords(lookupTerms.length > 0 ? lookupTerms : [normalized]);
  const results = contextWords.map(mapWordToCard);

  if (contextWords.length === 0) {
    return {
      mode: "question",
      lookupTerm,
      results,
      questionAnswer: {
        status: "unavailable",
        reason: "no_local_match",
        message: getMissingMatchMessage(lookupTerm)
      }
    };
  }

  if (!isOpenAIConfigured()) {
    return {
      mode: "question",
      lookupTerm,
      results,
      questionAnswer: {
        status: "unavailable",
        reason: "missing_api_key",
        message: "AI question answering is not configured yet. Add OPENAI_API_KEY to answer question-style searches."
      }
    };
  }

  try {
    const answer = await answerSearchQuestion(
      normalized,
      contextWords.slice(0, QUESTION_CONTEXT_LIMIT).map(mapWordToQuestionContext)
    );

    if (answer.status === "insufficient_context") {
      return {
        mode: "question",
        lookupTerm,
        results,
        questionAnswer: {
          status: "unavailable",
          reason: "insufficient_context",
          message: answer.answer
        }
      };
    }

    return {
      mode: "question",
      lookupTerm,
      results,
      questionAnswer: {
        status: "answered",
        answer: answer.answer,
        matchedWordIds: answer.matchedWordIds ?? []
      }
    };
  } catch (error) {
    return {
      mode: "question",
      lookupTerm,
      results,
      questionAnswer: {
        status: "unavailable",
        reason: "ai_error",
        message: error instanceof Error ? error.message : "Unable to answer that question right now."
      }
    };
  }
}
