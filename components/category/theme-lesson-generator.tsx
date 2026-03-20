"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";

type ThemeLessonGeneratorProps = {
  categorySlug: string;
  categoryName: string;
};

type LessonPlanResponse = {
  message: string;
  title: string;
  wordCount: number;
};

export function ThemeLessonGenerator({ categorySlug, categoryName }: ThemeLessonGeneratorProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/category/${categorySlug}/lesson-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const payload = (await response.json().catch(() => null)) as
        | LessonPlanResponse
        | {
            error?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload && "error" in payload ? payload.error ?? "Unable to generate the lesson plan." : "Unable to generate the lesson plan.");
      }

      const lessonPayload = payload as LessonPlanResponse;

      setMessage(
        `${lessonPayload.message} "${lessonPayload.title}" was built from ${lessonPayload.wordCount} theme word${
          lessonPayload.wordCount === 1 ? "" : "s"
        }.`
      );
      setEmail("");
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
          <Mail className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="section-label">Teacher tool</p>
          <h2 className="mt-2 text-xl text-slate-900">Email an AI lesson plan</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Generate a PDF lesson plan for the <span className="font-semibold text-slate-800">{categoryName}</span>{" "}
            theme and send it to the teacher email you enter here.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="section-label">Teacher email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="app-input mt-2"
            placeholder="teacher@ualberta.ca"
            required
          />
        </label>

        <button type="submit" className="tap-button-primary w-full" disabled={isSubmitting}>
          <Send className="mr-2 h-4 w-4" />
          {isSubmitting ? "Generating lesson plan..." : "Generate and email PDF"}
        </button>
      </form>

      {message ? <p className="mt-3 text-sm leading-6 text-moss-800">{message}</p> : null}
      {error ? <p className="mt-3 text-sm leading-6 text-rose-700">{error}</p> : null}
    </section>
  );
}
