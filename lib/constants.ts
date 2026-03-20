import type { FontSizeOption, PreferenceState, UiLanguageEmphasis } from "@/types";

export const RELATION_TYPE_VALUES = [
  "synonym",
  "antonym",
  "broader",
  "narrower",
  "associated",
  "categoryMember",
  "variant",
  "similar"
] as const;

export const RELATION_TYPE_LABELS: Record<(typeof RELATION_TYPE_VALUES)[number], string> = {
  synonym: "Synonym",
  antonym: "Antonym",
  broader: "Broader term",
  narrower: "Narrower term",
  associated: "Associated concept",
  categoryMember: "Category member",
  variant: "Variant",
  similar: "Similar word"
};

export const RELATION_TYPE_HELPERS: Record<(typeof RELATION_TYPE_VALUES)[number], string> = {
  synonym: "Another word with a close meaning",
  antonym: "An opposite or contrasting word",
  broader: "A more general concept",
  narrower: "A more specific concept",
  associated: "A word commonly connected in meaning or context",
  categoryMember: "A member of a broader theme or category",
  variant: "A spelling or lexical variant",
  similar: "A near match or comparable form"
};

export const HOME_CATEGORY_SLUGS = [
  "body-parts",
  "animals",
  "weather",
  "colours",
  "movement",
  "food",
  "feeling-lucky"
] as const;

export const FONT_SIZE_LABELS: Record<FontSizeOption, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  large: "Large"
};

export const UI_LANGUAGE_LABELS: Record<UiLanguageEmphasis, string> = {
  cree: "Cree-first",
  english: "English-first"
};

export const DEFAULT_PREFERENCES: PreferenceState = {
  fontSize: "comfortable",
  uiLanguageEmphasis: "cree",
  showSyllabics: true
};

export const PUBLIC_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/saved", label: "Saved" },
  { href: "/settings", label: "Settings" }
] as const;

export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/words", label: "Words" },
  { href: "/admin/import", label: "Import" }
] as const;

export const IMPORT_JSON_EXAMPLE = `[
  {
    "lemma": "miskîsik",
    "plainEnglish": "eye",
    "partOfSpeech": "dependent noun",
    "linguisticClass": "NDI-1 (demo label)",
    "beginnerExplanation": "A word for the eye, used in body-related vocabulary.",
    "expertExplanation": "Demo seed entry used to prototype dependent noun analysis.",
    "categorySlugs": ["body-parts"],
    "meanings": [
      { "gloss": "eye", "description": "Primary gloss", "sortOrder": 0 }
    ],
    "morphologyTables": [
      {
        "title": "Possession forms",
        "description": "Plain-English labels for learners",
        "isPlainEnglish": true,
        "sortOrder": 0,
        "entries": [
          { "rowLabel": "My eye", "value": "niskîsik", "sortOrder": 0 },
          { "rowLabel": "Your eye", "value": "kiskîsik", "sortOrder": 1 }
        ]
      }
    ],
    "relations": [
      { "targetLemma": "mistikwân", "relationType": "associated", "isBidirectional": true }
    ],
    "isDemo": true
  }
]`;

export const IMPORT_ITWEWINA_EXAMPLE = `apple
bear
friend`;

export const IMPORT_CSV_COLUMNS = [
  "lemma",
  "syllabics",
  "plainEnglish",
  "partOfSpeech",
  "linguisticClass",
  "rootStem",
  "pronunciation",
  "audioUrl",
  "source",
  "notes",
  "itwewinaMetadata",
  "beginnerExplanation",
  "expertExplanation",
  "categorySlugs",
  "meanings",
  "morphologyTables",
  "relations",
  "isDemo"
] as const;
