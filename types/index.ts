import { RELATION_TYPE_VALUES } from "@/lib/constants";

export type RelationTypeValue = (typeof RELATION_TYPE_VALUES)[number];
export type FontSizeOption = "compact" | "comfortable" | "large";
export type UiLanguageEmphasis = "cree" | "english";
export type DetailMode = "novice" | "expert";

export interface PreferenceState {
  fontSize: FontSizeOption;
  uiLanguageEmphasis: UiLanguageEmphasis;
  showSyllabics: boolean;
}

export interface SavedWordSnapshot {
  id: string;
  slug: string;
  lemma: string;
  syllabics?: string | null;
  plainEnglish: string;
  partOfSpeech?: string;
  savedAt: string;
}

export interface MeaningInput {
  gloss: string;
  description?: string;
  sortOrder: number;
}

export interface MorphologyEntryInput {
  rowLabel: string;
  columnLabel?: string;
  plainLabel?: string;
  value: string;
  sortOrder: number;
}

export interface MorphologyTableInput {
  title: string;
  description?: string;
  isPlainEnglish: boolean;
  sortOrder: number;
  entries: MorphologyEntryInput[];
}

export interface ItwewinaRelatedReference {
  kind: "rapidwords" | "wordnet";
  label: string;
  detail?: string;
  url?: string;
}

export interface ItwewinaInflectionalClass {
  code?: string;
  emoji?: string;
  description?: string;
  examples?: string;
}

export interface ItwewinaMetadata {
  relatedReferences?: ItwewinaRelatedReference[];
  inflectionalClass?: ItwewinaInflectionalClass;
}

export interface RelationInput {
  toWordId: string;
  relationType: RelationTypeValue;
  label?: string;
  isBidirectional: boolean;
}

export interface WordFormPayload {
  id?: string;
  lemma: string;
  syllabics?: string;
  plainEnglish: string;
  partOfSpeech: string;
  linguisticClass?: string;
  rootStem?: string;
  pronunciation?: string;
  audioUrl?: string;
  source?: string;
  notes?: string;
  itwewinaMetadata?: ItwewinaMetadata;
  beginnerExplanation?: string;
  expertExplanation?: string;
  meanings: MeaningInput[];
  categoryIds: string[];
  morphologyTables: MorphologyTableInput[];
  relations: RelationInput[];
  isDemo: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  colorToken?: string | null;
}

export interface WordOption {
  id: string;
  slug: string;
  lemma: string;
  plainEnglish: string;
}

export interface ImportWordPayload extends Omit<WordFormPayload, "categoryIds" | "relations"> {
  categoryIds?: string[];
  categorySlugs?: string[];
  categoryNames?: string[];
  relations?: Array<
    Omit<RelationInput, "toWordId"> & {
      toWordId?: string;
      targetLemma?: string;
      targetSlug?: string;
    }
  >;
}
