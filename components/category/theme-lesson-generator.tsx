"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileDown } from "lucide-react";

const PREPARATION_DURATION_MS = 5_000;
const PROGRESS_INTERVAL_MS = 50;
const TOTAL_PROGRESS_STEPS = PREPARATION_DURATION_MS / PROGRESS_INTERVAL_MS;

type ThemeLessonGeneratorProps = {
  categorySlug: string;
  categoryName: string;
  hasCachedLessonPlan: boolean;
};

export function ThemeLessonGenerator({
  categorySlug,
  categoryName,
  hasCachedLessonPlan
}: ThemeLessonGeneratorProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  async function downloadLessonPlan() {
    const response = await fetch(`/api/category/${categorySlug}/lesson-plan`);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Unable to download the lesson plan.");
    }

    const pdfBlob = await response.blob();
    const contentDisposition = response.headers.get("Content-Disposition") ?? "";
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
    const filename = filenameMatch?.[1] ?? `${categorySlug}-lesson-plan.pdf`;
    const downloadUrl = window.URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);

    setMessage(`Downloaded the ${categoryName} lesson plan PDF.`);
  }

  function handleDownload() {
    if (isSubmitting || !hasCachedLessonPlan) {
      return;
    }

    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setError("");
    setMessage("");
    setProgress(0);
    setIsSubmitting(true);

    let stepsCompleted = 0;

    intervalRef.current = window.setInterval(() => {
      stepsCompleted += 1;
      const nextProgress = Math.min(100, Math.round((stepsCompleted / TOTAL_PROGRESS_STEPS) * 100));

      setProgress(nextProgress);

      if (stepsCompleted >= TOTAL_PROGRESS_STEPS) {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        void (async () => {
          try {
            await downloadLessonPlan();
          } catch (requestError) {
            setError(
              requestError instanceof Error ? requestError.message : "Unable to download the lesson plan."
            );
          } finally {
            setIsSubmitting(false);
            setProgress(0);
          }
        })();
      }
    }, PROGRESS_INTERVAL_MS);
  }

  const progressLabel = progress < 100 ? "Preparing PDF" : "Sending PDF to your device";

  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-moss-100 p-3 text-moss-800">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="section-label">Teacher tool</p>
          <h2 className="mt-2 text-xl text-slate-900">Download a lesson plan PDF</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Prepare the <span className="font-semibold text-slate-800">{categoryName}</span> lesson plan PDF
            and save it directly to this device.
          </p>
        </div>
      </div>

      {hasCachedLessonPlan ? (
        isSubmitting ? (
          <div className="mt-4 rounded-3xl border border-moss-100 bg-moss-50/80 p-4">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-moss-900">
              <span>{progressLabel}</span>
              <span>{progress}%</span>
            </div>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-white/90"
              role="progressbar"
              aria-label={progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="h-full rounded-full bg-moss-700 transition-[width] duration-75 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Your lesson plan will download automatically when the progress bar reaches 100%.
            </p>
          </div>
        ) : (
          <button type="button" onClick={() => void handleDownload()} className="tap-button-primary mt-4 w-full">
            <FileDown className="mr-2 h-4 w-4" />
            Prepare and download PDF
          </button>
        )
      ) : (
        <div className="surface-muted mt-4 p-4 text-sm leading-6 text-slate-600">
          A lesson plan is not available for this theme yet.
        </div>
      )}

      {message ? (
        <p className="mt-3 text-sm leading-6 text-moss-800" aria-live="polite">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm leading-6 text-rose-700" aria-live="polite">
          {error}
        </p>
      ) : null}
    </section>
  );
}
