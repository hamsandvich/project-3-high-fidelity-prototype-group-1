"use client";

import { useMemo } from "react";

import { useAppState } from "@/components/providers/app-providers";
import { FONT_SIZE_LABELS, UI_LANGUAGE_LABELS } from "@/lib/constants";
import type { FontSizeOption, UiLanguageEmphasis } from "@/types";

export function SettingsPanel() {
  const { preferences, setPreferences, savedWords, clearSavedWords } = useAppState();

  const fontOptions = useMemo(() => Object.entries(FONT_SIZE_LABELS) as Array<[FontSizeOption, string]>, []);
  const languageOptions = useMemo(
    () => Object.entries(UI_LANGUAGE_LABELS) as Array<[UiLanguageEmphasis, string]>,
    []
  );

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <p className="section-label">Font size</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {fontOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreferences({ fontSize: value })}
              className={preferences.fontSize === value ? "tap-button-primary" : "tap-button-secondary"}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card p-5">
        <p className="section-label">Language emphasis</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {languageOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreferences({ uiLanguageEmphasis: value })}
              className={
                preferences.uiLanguageEmphasis === value ? "tap-button-primary" : "tap-button-secondary"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-label">Syllabics</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Show or hide syllabics wherever a word includes them.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPreferences({ showSyllabics: !preferences.showSyllabics })}
            className={preferences.showSyllabics ? "tap-button-primary" : "tap-button-secondary"}
          >
            {preferences.showSyllabics ? "On" : "Off"}
          </button>
        </div>
      </section>

      <section className="surface-card p-5">
        <p className="section-label">Saved words</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {savedWords.length} word{savedWords.length === 1 ? "" : "s"} stored locally on this device.
        </p>
        <button
          type="button"
          onClick={() => {
            if (savedWords.length === 0) {
              return;
            }

            if (window.confirm("Delete all saved words from this device?")) {
              clearSavedWords();
            }
          }}
          className="tap-button-secondary mt-4 w-full"
        >
          Delete all saved words
        </button>
      </section>
    </div>
  );
}
