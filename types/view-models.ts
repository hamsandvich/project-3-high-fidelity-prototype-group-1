import type { ItwewinaMetadata, RelationTypeValue } from "@/types";

export interface CategoryBadgeModel {
  id: string;
  name: string;
  slug: string;
  colorToken?: string | null;
}

export interface WordCardModel {
  id: string;
  slug: string;
  lemma: string;
  syllabics?: string | null;
  plainEnglish: string;
  partOfSpeech: string;
  categories?: Array<{
    category: CategoryBadgeModel;
  }>;
}

export interface HomeCategoryModel extends CategoryBadgeModel {
  description?: string | null;
  _count: {
    words: number;
  };
  words: Array<{
    word: WordCardModel;
  }>;
}

export interface WordMeaningModel {
  id: string;
  gloss: string;
  description?: string | null;
  sortOrder: number;
}

export interface MorphologyEntryModel {
  id: string;
  rowLabel: string;
  columnLabel?: string | null;
  plainLabel?: string | null;
  value: string;
  sortOrder: number;
}

export interface MorphologyTableModel {
  id: string;
  title: string;
  description?: string | null;
  isPlainEnglish: boolean;
  sortOrder: number;
  entries: MorphologyEntryModel[];
}

export interface RelatedWordModel {
  id: string;
  relationType: RelationTypeValue;
  label?: string | null;
  isBidirectional: boolean;
  word: WordCardModel;
}

export interface RelatedSectionModel {
  relationType: RelationTypeValue;
  items: RelatedWordModel[];
}

export interface WordDetailModel extends WordCardModel {
  linguisticClass?: string | null;
  rootStem?: string | null;
  pronunciation?: string | null;
  audioUrl?: string | null;
  beginnerExplanation?: string | null;
  expertExplanation?: string | null;
  notes?: string | null;
  source?: string | null;
  itwewinaMetadata?: ItwewinaMetadata | null;
  meanings: WordMeaningModel[];
  morphologyTables: MorphologyTableModel[];
  relatedWords: RelatedWordModel[];
  relatedSections: RelatedSectionModel[];
  categories: Array<{
    category: CategoryBadgeModel;
  }>;
}
