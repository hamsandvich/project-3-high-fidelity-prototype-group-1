import type {
  ImportWordPayload,
  ItwewinaMetadata,
  ItwewinaRelatedReference,
  MeaningInput,
  MorphologyEntryInput,
  MorphologyTableInput
} from "@/types";
import { emptyToUndefined, slugify, uniqueBy } from "@/lib/utils";

const ITWEWINA_BASE_URL = "https://itwewina.altlab.app";
const SEARCH_RESULT_ARTICLE_PATTERN =
  /<article class="definition box box--rounded" data-cy="search-result">([\s\S]*?)<\/article>/g;
const MEANING_ITEM_PATTERN = /<li class="meanings__meaning" data-cy="lemma-meaning">([\s\S]*?)<\/li>/g;
const DATA_ITEM_PATTERN = /<data(?:\s+value="([^"]*)")?>([\s\S]*?)<\/data>/g;
const BULK_AUDIO_CHUNK_SIZE = 25;
const SPEECH_DB_VARIANTS = ["maskwacis", "moswacihk"] as const;
const ITWEWINA_LABEL_MODES = [
  {
    cookieValue: "english",
    tableTitle: "Plain English labels",
    isPlainEnglish: true
  },
  {
    cookieValue: "linguistic",
    tableTitle: "Linguistic labels",
    isPlainEnglish: false
  },
  {
    cookieValue: "source_language",
    tableTitle: "nêhiyawêwin labels",
    isPlainEnglish: false
  }
] as const;
const SEARCH_RETRY_DELAYS_MS = [3_000, 5_000, 10_000] as const;
const MAX_SEARCH_ATTEMPTS = SEARCH_RETRY_DELAYS_MS.length + 1;
const SEARCH_ERROR_SNIPPET_LENGTH = 180;
const RETRYABLE_SEARCH_STATUS_CODES = new Set([429, 502, 503, 504]);
const PARADIGM_SECTION_PATTERN = /<tbody>([\s\S]*?)<\/tbody>/g;
const TABLE_ROW_PATTERN = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const TABLE_CELL_PATTERN = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g;

type SpeechDbVariant = (typeof SPEECH_DB_VARIANTS)[number];
type ItwewinaLabelMode = (typeof ITWEWINA_LABEL_MODES)[number];

type ItwewinaBreakdownItem = {
  codes: string[];
  text: string;
};

type ItwewinaSearchEntry = {
  lemma: string;
  syllabics?: string;
  partOfSpeech: string;
  linguisticClass?: string;
  rootStem?: string;
  meanings: string[];
  wordUrl: string;
  sourceQuery: string;
  audioUrl?: string;
  itwewinaMetadata?: ItwewinaMetadata;
  morphologyTables: MorphologyTableInput[];
};

type SpeechDbResponse = {
  matched_recordings?: Array<{
    wordform?: string;
    recording_url?: string;
    is_best?: boolean;
  }>;
};

export type ItwewinaImportBatch = {
  queryCount: number;
  words: ImportWordPayload[];
  warnings: string[];
};

type ItwewinaTableCell = {
  tag: "th" | "td";
  attributes: Record<string, string>;
  html: string;
  text: string;
};

export type ItwewinaImportProgressEvent = {
  stage: "starting" | "waiting" | "searching" | "retrying" | "enriching" | "finalizing" | "complete" | "skipped";
  completed: number;
  total: number;
  term?: string;
  status: string;
  unitLabel?: string;
};

type BuildItwewinaImportBatchOptions = {
  onProgress?: (event: ItwewinaImportProgressEvent) => Promise<void> | void;
};

type ItwewinaRetryHandler = (event: {
  error: ItwewinaSearchError;
  delayMs: number;
  nextAttempt: number;
}) => Promise<void> | void;

class ItwewinaSearchError extends Error {
  readonly query: string;
  readonly attempt: number;
  readonly status?: number;
  readonly statusText?: string;
  readonly responseSnippet?: string;
  readonly retryAfterSeconds?: number;

  constructor(params: {
    query: string;
    attempt: number;
    status?: number;
    statusText?: string;
    responseSnippet?: string;
    retryAfterSeconds?: number;
    causeMessage?: string;
  }) {
    super(
      params.status
        ? `itwewina search failed for "${params.query}": ${formatSearchFailureReason(params)}.`
        : `itwewina search failed for "${params.query}": ${formatRequestFailureReason(params)}.`
    );

    this.name = "ItwewinaSearchError";
    this.query = params.query;
    this.attempt = params.attempt;
    this.status = params.status;
    this.statusText = params.statusText;
    this.responseSnippet = params.responseSnippet;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function parseRetryAfterSeconds(value: string | null) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const retryAt = Date.parse(value);

  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

function formatSearchFailureReason(params: {
  status?: number;
  statusText?: string;
  responseSnippet?: string;
  retryAfterSeconds?: number;
  attempt: number;
}) {
  const details = [
    `${params.status}${params.statusText ? ` ${params.statusText}` : ""} from itwewina`
  ];

  if (params.responseSnippet) {
    details.push(`response preview: ${params.responseSnippet}`);
  }

  if (params.retryAfterSeconds !== undefined) {
    details.push(`retry-after: ${params.retryAfterSeconds}s`);
  }

  if (params.attempt > 1) {
    details.push(`attempts: ${params.attempt}`);
  }

  if (params.status === 429 && params.attempt > 1) {
    details.push(
      `retry schedule: ${SEARCH_RETRY_DELAYS_MS.map((delayMs) => `${delayMs / 1000}s`).join(", ")}`
    );
  }

  return details.join("; ");
}

function formatRequestFailureReason(params: {
  causeMessage?: string;
  attempt: number;
}) {
  const details = [params.causeMessage ?? "request failed before a response was returned"];

  if (params.attempt > 1) {
    details.push(`attempts: ${params.attempt}`);
  }

  return details.join("; ");
}

function getErrorResponseSnippet(value: string) {
  const snippet = stripTags(value);

  if (!snippet) {
    return undefined;
  }

  return truncateText(snippet, SEARCH_ERROR_SNIPPET_LENGTH);
}

function isRetryableSearchError(error: ItwewinaSearchError) {
  return error.status ? RETRYABLE_SEARCH_STATUS_CODES.has(error.status) : true;
}

function getRetryDelayMs(error: ItwewinaSearchError, attempt: number) {
  const scheduledDelayMs = SEARCH_RETRY_DELAYS_MS[attempt - 1] ?? SEARCH_RETRY_DELAYS_MS.at(-1) ?? 0;
  const retryAfterMs = error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 0;
  return Math.max(scheduledDelayMs, retryAfterMs);
}

function formatSkippedSearchWarning(error: ItwewinaSearchError) {
  if (!error.status) {
    return `Skipped "${error.query}": ${formatRequestFailureReason(error)}.`;
  }

  return `Skipped "${error.query}": ${formatSearchFailureReason(error)}.`;
}

function formatSkippedSearchTermsWarning(terms: string[]) {
  if (terms.length === 0) {
    return "";
  }

  return `Skipped search term(s): ${terms.map((term) => `"${term}"`).join(", ")}.`;
}

function buildImportFailureMessage(warnings: string[]) {
  const visibleWarnings = warnings.slice(0, 5);
  const remainingCount = warnings.length - visibleWarnings.length;

  return [
    "Unable to import any itwewina entries.",
    ...visibleWarnings,
    remainingCount > 0 ? `Skipped ${remainingCount} additional search term(s).` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function reportProgress(
  options: BuildItwewinaImportBatchOptions,
  event: ItwewinaImportProgressEvent
) {
  await options.onProgress?.(event);
}

function formatRetryStatus(term: string, error: ItwewinaSearchError, delayMs: number, nextAttempt: number) {
  const reason = error.status
    ? `${error.status}${error.statusText ? ` ${error.statusText}` : ""}`
    : error.message.replace(`itwewina search failed for "${term}": `, "").replace(/\.$/, "");

  return `Retrying "${term}" after ${reason}. Waiting ${Math.ceil(delayMs / 1000)}s before attempt ${nextAttempt} of ${MAX_SEARCH_ATTEMPTS}.`;
}

function decodeHtmlEntities(value: string) {
  const decodedNamed = value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'");

  return decodedNamed
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([a-f0-9]+);/gi, (_, codePoint) => String.fromCodePoint(parseInt(codePoint, 16)));
}

function collapseWhitespace(value: string) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function stripTags(value: string) {
  return collapseWhitespace(value.replace(/<[^>]+>/g, " "));
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1];
    if (!name || name.startsWith("<")) {
      continue;
    }

    attributes[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function extractMeanings(articleHtml: string) {
  const meanings: string[] = [];

  for (const match of articleHtml.matchAll(MEANING_ITEM_PATTERN)) {
    const firstText = match[1]?.match(/^\s*([^<]+)/)?.[1];
    const gloss = collapseWhitespace(firstText ?? "");

    if (gloss) {
      meanings.push(gloss);
    }
  }

  return uniqueBy(meanings, (meaning) => meaning.toLowerCase());
}

function parseBreakdownCodes(rawValue?: string) {
  if (!rawValue) {
    return [];
  }

  const decoded = decodeHtmlEntities(rawValue);
  const quoted = Array.from(decoded.matchAll(/['"]([^'"]+)['"]/g), (match) => match[1]?.trim()).filter(
    (value): value is string => Boolean(value)
  );

  if (quoted.length > 0) {
    return quoted;
  }

  return decoded
    .replace(/[[\]]/g, "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function extractBreakdown(articleHtml: string) {
  const breakdownHtml = articleHtml.match(/<div[^>]*data-cy="linguistic-breakdown"[^>]*>([\s\S]*?)<\/div>/)?.[1];

  if (!breakdownHtml) {
    return [];
  }

  const items: ItwewinaBreakdownItem[] = [];

  for (const match of breakdownHtml.matchAll(DATA_ITEM_PATTERN)) {
    const text = stripTags(match[2] ?? "");
    if (!text) {
      continue;
    }

    items.push({
      codes: parseBreakdownCodes(match[1]),
      text
    });
  }

  return items;
}

function formatLinguisticClass(items: ItwewinaBreakdownItem[]) {
  const label = items
    .map((item) => {
      const summary = item.text.split("—")[0]?.trim() ?? item.text;
      return item.codes.length > 0 ? `${item.codes.join("/")}: ${summary}` : summary;
    })
    .join(" | ");

  return emptyToUndefined(label);
}

function formatRelatedReference(reference: ItwewinaRelatedReference) {
  return `${reference.kind === "rapidwords" ? "RapidWords" : "WordNet"}: ${reference.label}${
    reference.detail ? ` (${reference.detail})` : ""
  }`;
}

function buildNotes(entry: ItwewinaSearchEntry) {
  const details = [
    `Imported from ${entry.wordUrl}`,
    `Search query: ${entry.sourceQuery}`
  ];

  if (entry.linguisticClass) {
    details.push(`Breakdown: ${entry.linguisticClass}`);
  }

  if (entry.rootStem) {
    details.push(`Stem: ${entry.rootStem}`);
  }

  if (entry.itwewinaMetadata?.relatedReferences?.length) {
    details.push(
      `Related references: ${entry.itwewinaMetadata.relatedReferences.map(formatRelatedReference).join("; ")}`
    );
  }

  return details.join(" | ");
}

function buildExpertExplanation(entry: ItwewinaSearchEntry) {
  const details: string[] = [];
  const inflectionalClass = entry.itwewinaMetadata?.inflectionalClass;

  if (inflectionalClass?.description) {
    details.push(inflectionalClass.description);
  }

  if (entry.rootStem) {
    details.push(`Stem: ${entry.rootStem}`);
  }

  if (entry.itwewinaMetadata?.relatedReferences?.length) {
    details.push(
      `Related references: ${entry.itwewinaMetadata.relatedReferences.map(formatRelatedReference).join("; ")}`
    );
  }

  return details.join(". ");
}

function mapEntryToImportWord(entry: ItwewinaSearchEntry): ImportWordPayload {
  const meanings: MeaningInput[] = entry.meanings.map((gloss, index) => ({
    gloss,
    description: index === 0 ? "Primary gloss from itwewina search" : "",
    sortOrder: index
  }));

  return {
    lemma: entry.lemma,
    syllabics: entry.syllabics ?? "",
    plainEnglish: entry.meanings[0] ?? entry.sourceQuery,
    partOfSpeech: entry.partOfSpeech,
    linguisticClass: entry.linguisticClass ?? "",
    rootStem: entry.rootStem ?? "",
    pronunciation: "",
    audioUrl: entry.audioUrl ?? "",
    source: entry.wordUrl,
    notes: buildNotes(entry),
    itwewinaMetadata: entry.itwewinaMetadata,
    beginnerExplanation: "",
    expertExplanation: buildExpertExplanation(entry),
    categoryIds: [],
    meanings,
    morphologyTables: entry.morphologyTables,
    relations: [],
    isDemo: false
  };
}

function mergeEntries(entries: ItwewinaSearchEntry[]) {
  const merged = new Map<string, ItwewinaSearchEntry>();

  for (const entry of entries) {
    const key = slugify(entry.lemma);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...entry,
        meanings: [...entry.meanings],
        morphologyTables: [...entry.morphologyTables]
      });
      continue;
    }

    existing.meanings = uniqueBy([...existing.meanings, ...entry.meanings], (meaning) => meaning.toLowerCase());
    existing.sourceQuery = uniqueBy(
      [existing.sourceQuery, entry.sourceQuery].flatMap((value) => value.split(" | ")),
      (value) => value.toLowerCase()
    ).join(" | ");
    existing.audioUrl = existing.audioUrl ?? entry.audioUrl;
    existing.linguisticClass = existing.linguisticClass ?? entry.linguisticClass;
    existing.rootStem = existing.rootStem ?? entry.rootStem;
  }

  return Array.from(merged.values());
}

function normalizeWordformKey(value: string) {
  return collapseWhitespace(value).toLowerCase().normalize("NFKD");
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildSpeechDbUrl(variant: SpeechDbVariant, lemmas: string[]) {
  const url = new URL(`${variant}/api/bulk_search`, "https://speech-db.altlab.app/");

  lemmas.forEach((lemma) => {
    url.searchParams.append("q", lemma);
    url.searchParams.append("exact", "true");
  });

  return url;
}

async function fetchSpeechDbAudioByLemma(lemmas: string[]) {
  const audioByLemma = new Map<string, string>();

  for (const chunk of chunkArray(lemmas, BULK_AUDIO_CHUNK_SIZE)) {
    for (const variant of SPEECH_DB_VARIANTS) {
      try {
        const response = await fetch(buildSpeechDbUrl(variant, chunk), {
          cache: "no-store"
        });

        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as SpeechDbResponse;
        const recordings = payload.matched_recordings ?? [];

        recordings
          .sort((left, right) => Number(Boolean(right.is_best)) - Number(Boolean(left.is_best)))
          .forEach((recording) => {
            const wordform = recording.wordform ? normalizeWordformKey(recording.wordform) : "";
            const recordingUrl = recording.recording_url?.replace(/^http:\/\//, "https://");

            if (!wordform || !recordingUrl || audioByLemma.has(wordform)) {
              return;
            }

            audioByLemma.set(wordform, recordingUrl);
          });
      } catch {
        continue;
      }
    }
  }

  return audioByLemma;
}

async function enrichEntriesWithAudio(
  entries: ItwewinaSearchEntry[],
  options: {
    onProgress?: (event: { completed: number; total: number; status: string }) => Promise<void> | void;
  } = {}
) {
  const uniqueLemmas = uniqueBy(entries.map((entry) => entry.lemma), (lemma) => normalizeWordformKey(lemma));
  const audioChunks = chunkArray(uniqueLemmas, BULK_AUDIO_CHUNK_SIZE);

  if (audioChunks.length > 0) {
    await options.onProgress?.({
      completed: 0,
      total: audioChunks.length,
      status: `Looking up audio for ${uniqueLemmas.length} matched entr${uniqueLemmas.length === 1 ? "y" : "ies"}.`
    });
  }

  const audioByLemma = new Map<string, string>();

  for (const [chunkIndex, chunk] of audioChunks.entries()) {
    await options.onProgress?.({
      completed: chunkIndex,
      total: audioChunks.length,
      status: `Looking up audio batch ${chunkIndex + 1} of ${audioChunks.length}.`
    });

    const chunkAudio = await fetchSpeechDbAudioByLemma(chunk);

    chunkAudio.forEach((value, key) => {
      if (!audioByLemma.has(key)) {
        audioByLemma.set(key, value);
      }
    });
  }

  if (audioChunks.length > 0) {
    await options.onProgress?.({
      completed: audioChunks.length,
      total: audioChunks.length,
      status: `Finished audio lookup for ${uniqueLemmas.length} matched entr${uniqueLemmas.length === 1 ? "y" : "ies"}.`
    });
  }

  return entries.map((entry) => ({
    ...entry,
    audioUrl: audioByLemma.get(normalizeWordformKey(entry.lemma)) ?? entry.audioUrl
  }));
}

function normalizeDetailText(value: string) {
  return emptyToUndefined(
    collapseWhitespace(value)
      .replace(/^\((.*)\)$/u, "$1")
      .trim()
  );
}

function extractRelatedReferences(html: string) {
  const relatedWordsHtml = html.match(
    /<div[^>]*data-cy="related-words"[^>]*>([\s\S]*?)<\/div>\s*<div class="tooltip__arrow"/
  )?.[1];

  if (!relatedWordsHtml) {
    return [];
  }

  const references: ItwewinaRelatedReference[] = [];
  const sections = [
    {
      kind: "rapidwords" as const,
      pattern: /is in the RapidWords category:\s*<ul>([\s\S]*?)<\/ul>/i
    },
    {
      kind: "wordnet" as const,
      pattern: /is in the WordNet category:\s*<ul>([\s\S]*?)<\/ul>/i
    }
  ];

  for (const section of sections) {
    const listHtml = relatedWordsHtml.match(section.pattern)?.[1];

    if (!listHtml) {
      continue;
    }

    for (const listItemMatch of listHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const listItemHtml = listItemMatch[1] ?? "";
      const anchorMatch = listItemHtml.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const label = collapseWhitespace(anchorMatch?.[2] ?? stripTags(listItemHtml));

      if (!label) {
        continue;
      }

      references.push({
        kind: section.kind,
        label,
        detail: normalizeDetailText(listItemHtml.replace(anchorMatch?.[0] ?? "", " ")),
        url: anchorMatch?.[1] ? new URL(anchorMatch[1], ITWEWINA_BASE_URL).toString() : undefined
      });
    }
  }

  return uniqueBy(references, (reference) => `${reference.kind}:${reference.label.toLowerCase()}`);
}

function extractInflectionalClass(html: string): ItwewinaMetadata["inflectionalClass"] {
  const elaborationHtml = html.match(/<div class="definition__elaboration"[^>]*>([\s\S]*?)<\/div>\s*<\/header>/)?.[1];

  if (!elaborationHtml) {
    return undefined;
  }

  const code = emptyToUndefined(collapseWhitespace(elaborationHtml.match(/^\s*([\s\S]*?)<span class="wordclass"/)?.[1] ?? ""));
  const emoji = emptyToUndefined(
    collapseWhitespace(elaborationHtml.match(/<span class="wordclass__emoji">([\s\S]*?)<\/span>/)?.[1] ?? "")
  );
  const tooltipText = collapseWhitespace(
    elaborationHtml.match(
      /<span class="wordclass__inflectional-class[\s\S]*?<\/span><div[^>]*class="tooltip"[^>]*>\s*([\s\S]*?)\s*<div class="tooltip__arrow"/
    )?.[1] ?? ""
  );

  const tooltipMatch = tooltipText.match(/^(.*?)(?:\s*-\s*tâpiskôc:\s*(.*))?$/iu);
  const description = emptyToUndefined(tooltipMatch?.[1] ?? tooltipText);
  const examples =
    emptyToUndefined(tooltipMatch?.[2]) ??
    emptyToUndefined(
      collapseWhitespace(
        (elaborationHtml.match(/<span class="wordclass__inflectional-class[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "").replace(
          /^like:\s*/iu,
          ""
        )
      )
    );

  if (!code && !emoji && !description && !examples) {
    return undefined;
  }

  return {
    code,
    emoji,
    description,
    examples
  };
}

function extractItwewinaMetadata(html: string) {
  const relatedReferences = extractRelatedReferences(html);
  const inflectionalClass = extractInflectionalClass(html);

  if (relatedReferences.length === 0 && !inflectionalClass) {
    return undefined;
  }

  return {
    ...(relatedReferences.length > 0 ? { relatedReferences } : {}),
    ...(inflectionalClass ? { inflectionalClass } : {})
  } satisfies ItwewinaMetadata;
}

function extractTableCells(rowHtml: string) {
  return Array.from(rowHtml.matchAll(TABLE_CELL_PATTERN), (match) => ({
    tag: match[1] as "th" | "td",
    attributes: parseAttributes(`<${match[1]}${match[2] ?? ""}>`),
    html: match[3] ?? "",
    text: stripTags(match[3] ?? "")
  })) satisfies ItwewinaTableCell[];
}

function parseParadigmValueCell(cell: ItwewinaTableCell) {
  const className = cell.attributes.class ?? "";

  if (className.includes("paradigm-cell--empty")) {
    return null;
  }

  if (className.includes("paradigm-cell--missing")) {
    return {
      value: "—",
      plainLabel: ""
    };
  }

  const value =
    emptyToUndefined(collapseWhitespace(cell.html.match(/<span[^>]*data-orth[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "")) ??
    emptyToUndefined(collapseWhitespace(cell.html.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] ?? "")) ??
    "—";

  return {
    value,
    plainLabel: emptyToUndefined(collapseWhitespace(cell.html.match(/<ol>\s*<li>([\s\S]*?)<\/li>\s*<\/ol>/)?.[1] ?? "")) ?? ""
  };
}

function parseParadigmTables(html: string, mode: ItwewinaLabelMode) {
  const paradigmTableHtml = html.match(
    /<section class="definition__paradigm paradigm js-replaceable-paradigm"[^>]*>[\s\S]*?<table class="paradigm__table">([\s\S]*?)<\/table>/
  )?.[1];

  if (!paradigmTableHtml) {
    return [];
  }

  const tables: MorphologyTableInput[] = [];

  for (const sectionMatch of paradigmTableHtml.matchAll(PARADIGM_SECTION_PATTERN)) {
    const sectionHtml = sectionMatch[1] ?? "";
    const description = collapseWhitespace(sectionHtml.match(/<th class="paradigm-header"[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? "");
    const entries: MorphologyEntryInput[] = [];
    let columnLabels: string[] = [];

    for (const rowMatch of sectionHtml.matchAll(TABLE_ROW_PATTERN)) {
      const rowHtml = rowMatch[0] ?? "";
      const cells = extractTableCells(rowHtml);

      if (cells.length === 0) {
        continue;
      }

      const isSectionHeaderRow =
        cells.length === 1 && cells[0]?.tag === "th" && (cells[0].attributes.class ?? "").includes("paradigm-header");

      if (isSectionHeaderRow) {
        continue;
      }

      const currentColumnLabels = cells
        .filter((cell) => cell.tag === "th" && cell.attributes.scope === "col")
        .map((cell) => cell.text)
        .filter(Boolean);

      if (currentColumnLabels.length > 0) {
        columnLabels = currentColumnLabels;
        continue;
      }

      const rowLabel = emptyToUndefined(cells.find((cell) => cell.tag === "th" && cell.attributes.scope !== "col")?.text);

      if (!rowLabel) {
        continue;
      }

      const valueCells = cells.filter(
        (cell) => cell.tag === "td" && !(cell.attributes.class ?? "").includes("paradigm-cell--empty")
      );

      if (valueCells.length === 0) {
        continue;
      }

      valueCells.forEach((cell, valueIndex) => {
        const parsedValue = parseParadigmValueCell(cell);

        if (!parsedValue) {
          return;
        }

        entries.push({
          rowLabel,
          columnLabel: columnLabels[valueIndex] ?? "",
          plainLabel: parsedValue.plainLabel,
          value: parsedValue.value,
          sortOrder: entries.length
        });
      });
    }

    if (entries.length === 0) {
      continue;
    }

    tables.push({
      title: mode.tableTitle,
      description,
      isPlainEnglish: mode.isPlainEnglish,
      sortOrder: tables.length,
      entries
    });
  }

  return tables;
}

function setTableSortOrders(tables: MorphologyTableInput[]) {
  return tables.map((table, tableIndex) => ({
    ...table,
    sortOrder: tableIndex,
    entries: table.entries.map((entry, entryIndex) => ({
      ...entry,
      sortOrder: entryIndex
    }))
  }));
}

function formatPartialDetailWarning(
  entry: ItwewinaSearchEntry,
  mode: ItwewinaLabelMode,
  error: ItwewinaSearchError
) {
  return `Imported "${entry.lemma}" without ${mode.tableTitle.toLowerCase()}: ${formatSearchFailureReason(error)}.`;
}

async function enrichEntryWithWordDetails(entry: ItwewinaSearchEntry) {
  const tables: MorphologyTableInput[] = [];
  const warnings: string[] = [];
  let itwewinaMetadata = entry.itwewinaMetadata;
  let linguisticClass = entry.linguisticClass;

  for (const mode of ITWEWINA_LABEL_MODES) {
    const url = new URL(entry.wordUrl);
    url.searchParams.set("paradigm-size", "full");

    try {
      const html = await fetchItwewinaHtml(`${entry.lemma} ${mode.tableTitle}`, url, {
        init: {
          headers: {
            Cookie: `display_mode=${mode.cookieValue}`
          }
        }
      });

      if (mode.cookieValue === "english") {
        const metadata = extractItwewinaMetadata(html);
        itwewinaMetadata = metadata ?? itwewinaMetadata;
        linguisticClass = metadata?.inflectionalClass?.code ?? linguisticClass;
      }

      tables.push(...parseParadigmTables(html, mode));
    } catch (error) {
      if (error instanceof ItwewinaSearchError) {
        warnings.push(formatPartialDetailWarning(entry, mode, error));
        continue;
      }

      throw error;
    }
  }

  return {
    entry: {
      ...entry,
      linguisticClass,
      itwewinaMetadata,
      morphologyTables: setTableSortOrders(tables)
    },
    warnings
  };
}

async function enrichEntriesWithWordDetails(
  entries: ItwewinaSearchEntry[],
  options: {
    onProgress?: (event: { completed: number; total: number; term?: string; status: string }) => Promise<void> | void;
  } = {}
) {
  const enrichedEntries: ItwewinaSearchEntry[] = [];
  const warnings: string[] = [];

  if (entries.length > 0) {
    await options.onProgress?.({
      completed: 0,
      total: entries.length,
      status: `Enriching ${entries.length} matched entr${entries.length === 1 ? "y" : "ies"} from full Itwewina pages.`
    });
  }

  for (const [index, entry] of entries.entries()) {
    await options.onProgress?.({
      completed: index,
      total: entries.length,
      term: entry.lemma,
      status: `Enriching "${entry.lemma}" from its full Itwewina page (${index + 1} of ${entries.length}).`
    });

    const enriched = await enrichEntryWithWordDetails(entry);
    enrichedEntries.push(enriched.entry);
    warnings.push(...enriched.warnings);
  }

  if (entries.length > 0) {
    await options.onProgress?.({
      completed: entries.length,
      total: entries.length,
      status: `Finished full-page enrichment for ${entries.length} matched entr${entries.length === 1 ? "y" : "ies"}.`
    });
  }

  return {
    entries: enrichedEntries,
    warnings
  };
}

function parseSearchResultArticle(articleHtml: string, sourceQuery: string): ItwewinaSearchEntry | null {
  const lemmaLinkMatch = articleHtml.match(/<a[^>]*data-cy="lemma-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  const spanTagMatch = lemmaLinkMatch?.[2]?.match(/<span[^>]*data-orth[^>]*>/);

  if (!lemmaLinkMatch || !spanTagMatch) {
    return null;
  }

  const spanAttributes = parseAttributes(spanTagMatch[0]);
  const lemma = stripTags(lemmaLinkMatch[2] ?? "");
  const meanings = extractMeanings(articleHtml);
  const breakdown = extractBreakdown(articleHtml);
  const rootStem = collapseWhitespace(
    articleHtml.match(/<h3 class="linguistic-breakdown__stem">\s*([\s\S]*?)\s*<\/h3>/)?.[1] ?? ""
  );

  if (!lemma || meanings.length === 0) {
    return null;
  }

  return {
    lemma,
    syllabics: emptyToUndefined(spanAttributes["data-orth-Cans"]),
    partOfSpeech: breakdown[0]?.text.split("—")[0]?.trim() || "Dictionary entry",
    linguisticClass: formatLinguisticClass(breakdown),
    rootStem: emptyToUndefined(rootStem),
    meanings,
    wordUrl: new URL(lemmaLinkMatch[1], ITWEWINA_BASE_URL).toString(),
    sourceQuery,
    morphologyTables: []
  };
}

export function parseItwewinaSearchHtml(html: string, sourceQuery: string) {
  const entries = Array.from(html.matchAll(SEARCH_RESULT_ARTICLE_PATTERN), (match) =>
    parseSearchResultArticle(match[1] ?? "", sourceQuery)
  ).filter((entry): entry is ItwewinaSearchEntry => Boolean(entry));

  return mergeEntries(entries);
}

async function fetchItwewinaHtml(
  requestLabel: string,
  url: URL,
  options: {
    init?: RequestInit;
    onRetry?: ItwewinaRetryHandler;
  } = {}
) {
  for (let attempt = 1; attempt <= MAX_SEARCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...options.init
      });

      if (response.ok) {
        return await response.text();
      }

      const responseText = await response.text().catch(() => "");
      const error = new ItwewinaSearchError({
        query: requestLabel,
        attempt,
        status: response.status,
        statusText: response.statusText,
        responseSnippet: getErrorResponseSnippet(responseText),
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after"))
      });

      if (attempt < MAX_SEARCH_ATTEMPTS && isRetryableSearchError(error)) {
        const delayMs = getRetryDelayMs(error, attempt);
        await options.onRetry?.({
          error,
          delayMs,
          nextAttempt: attempt + 1
        });
        await sleep(delayMs);
        continue;
      }

      throw error;
    } catch (error) {
      const searchError =
        error instanceof ItwewinaSearchError
          ? error
          : new ItwewinaSearchError({
              query: requestLabel,
              attempt,
              causeMessage: error instanceof Error ? error.message : "request failed before a response was returned"
            });

      if (attempt < MAX_SEARCH_ATTEMPTS && isRetryableSearchError(searchError)) {
        const delayMs = getRetryDelayMs(searchError, attempt);
        await options.onRetry?.({
          error: searchError,
          delayMs,
          nextAttempt: attempt + 1
        });
        await sleep(delayMs);
        continue;
      }

      throw searchError;
    }
  }

  throw new Error(`itwewina request failed for "${requestLabel}" after ${MAX_SEARCH_ATTEMPTS} attempts.`);
}

async function fetchItwewinaSearchHtml(query: string, options: { onRetry?: ItwewinaRetryHandler } = {}) {
  const url = new URL("/search", ITWEWINA_BASE_URL);
  url.searchParams.set("q", query);

  return fetchItwewinaHtml(query, url, options);
}

function parseSearchTerms(rawText: string) {
  return uniqueBy(
    rawText
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
    (value) => value.toLowerCase()
  );
}

export async function buildItwewinaImportBatch(
  rawText: string,
  options: BuildItwewinaImportBatchOptions = {}
): Promise<ItwewinaImportBatch> {
  const searchTerms = parseSearchTerms(rawText);

  if (searchTerms.length === 0) {
    throw new Error("Add at least one itwewina search term.");
  }

  await reportProgress(options, {
    stage: "starting",
    completed: 0,
    total: searchTerms.length,
    status: `Preparing ${searchTerms.length} itwewina search term(s).`,
    unitLabel: "search terms"
  });

  const fetchedEntries: ItwewinaSearchEntry[] = [];
  const warnings: string[] = [];
  const skippedSearchTerms: string[] = [];

  for (const [index, term] of searchTerms.entries()) {
    try {
      await reportProgress(options, {
        stage: "searching",
        completed: index,
        total: searchTerms.length,
        term,
        status: `Searching "${term}" on itwewina.`,
        unitLabel: "search terms"
      });

      const html = await fetchItwewinaSearchHtml(term, {
        onRetry: async ({ error, delayMs, nextAttempt }) => {
          await reportProgress(options, {
            stage: "retrying",
            completed: index,
            total: searchTerms.length,
            term,
            status: formatRetryStatus(term, error, delayMs, nextAttempt),
            unitLabel: "search terms"
          });
        }
      });
      const parsedEntries = parseItwewinaSearchHtml(html, term);
      fetchedEntries.push(...parsedEntries);
      await reportProgress(options, {
        stage: "complete",
        completed: index + 1,
        total: searchTerms.length,
        term,
        status:
          parsedEntries.length > 0
            ? `Finished "${term}" with ${parsedEntries.length} importable match(es).`
            : `Finished "${term}" with no importable matches.`,
        unitLabel: "search terms"
      });
    } catch (error) {
      if (error instanceof ItwewinaSearchError) {
        const warning = formatSkippedSearchWarning(error);
        warnings.push(warning);
        skippedSearchTerms.push(term);
        await reportProgress(options, {
          stage: "skipped",
          completed: index + 1,
          total: searchTerms.length,
          term,
          status: warning,
          unitLabel: "search terms"
        });
        continue;
      }

      throw error;
    }
  }

  const skippedTermsWarning = formatSkippedSearchTermsWarning(skippedSearchTerms);
  if (skippedTermsWarning) {
    warnings.push(skippedTermsWarning);
  }

  if (fetchedEntries.length === 0 && warnings.length > 0) {
    throw new Error(buildImportFailureMessage(warnings));
  }

  const mergedEntries = mergeEntries(fetchedEntries);

  const detailedEntries = await enrichEntriesWithWordDetails(mergedEntries, {
    onProgress: async (event) => {
      await reportProgress(options, {
        stage: "enriching",
        completed: event.completed,
        total: event.total,
        term: event.term,
        status: event.status,
        unitLabel: "matched entries"
      });
    }
  });
  warnings.push(...detailedEntries.warnings);

  const entries = await enrichEntriesWithAudio(detailedEntries.entries, {
    onProgress: async (event) => {
      await reportProgress(options, {
        stage: "finalizing",
        completed: event.completed,
        total: event.total,
        status: event.status,
        unitLabel: "audio batches"
      });
    }
  });

  return {
    queryCount: searchTerms.length,
    words: entries.map(mapEntryToImportWord),
    warnings
  };
}
