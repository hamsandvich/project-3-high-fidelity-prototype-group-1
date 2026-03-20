"use client";

import { useState } from "react";
import { Download, FileDown } from "lucide-react";

type ThemeLessonGeneratorProps = {
  categorySlug: string;
  categoryName: string;
};

export function ThemeLessonGenerator({ categorySlug, categoryName }: ThemeLessonGeneratorProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDownload() {
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/category/${categorySlug}/lesson-plan`, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to generate the lesson plan.");
      }

      const pdfBlob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] ?? `${categorySlug}-lesson-plan.pdf`;
      const lessonTitle = decodeURIComponent(response.headers.get("X-Lesson-Plan-Title") ?? categoryName);
      const wordCount = Number.parseInt(response.headers.get("X-Lesson-Plan-Word-Count") ?? "0", 10);
      const downloadUrl = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setMessage(
        `Downloaded "${lessonTitle}" built from ${wordCount} theme word${
          wordCount === 1 ? "" : "s"
        }.`
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate the lesson plan.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-moss-100 p-3 text-moss-800">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="section-label">Teacher tool</p>
          <h2 className="mt-2 text-xl text-slate-900">Download an AI lesson plan</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Generate a PDF lesson plan for the <span className="font-semibold text-slate-800">{categoryName}</span>{" "}
            theme and save it directly to this device.
          </p>
        </div>
      </div>

      <button type="button" onClick={() => void handleDownload()} className="tap-button-primary mt-4 w-full" disabled={isSubmitting}>
        <FileDown className="mr-2 h-4 w-4" />
        {isSubmitting ? "Generating PDF..." : "Generate and download PDF"}
      </button>

      {message ? <p className="mt-3 text-sm leading-6 text-moss-800">{message}</p> : null}
      {error ? <p className="mt-3 text-sm leading-6 text-rose-700">{error}</p> : null}
    </section>
  );
}
