import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

type OpenAITask = "catalogEnrichment" | "lessonPlan" | "flashcards";
type OpenAIReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

const DEFAULT_MODELS: Record<OpenAITask, string> = {
  catalogEnrichment: "gpt-5-mini",
  lessonPlan: "gpt-5-mini",
  flashcards: "gpt-5-mini"
};

let client: OpenAI | undefined;

function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY?.trim();
}

export function isOpenAIConfigured() {
  return Boolean(getOpenAIApiKey());
}

export function getOpenAIModel(task: OpenAITask) {
  const taskOverride =
    task === "catalogEnrichment"
      ? process.env.OPENAI_ENRICHMENT_MODEL?.trim()
      : task === "lessonPlan"
        ? process.env.OPENAI_LESSON_PLAN_MODEL?.trim()
        : process.env.OPENAI_FLASHCARD_MODEL?.trim();

  return taskOverride || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODELS[task];
}

export function getOpenAIClient() {
  const apiKey = getOpenAIApiKey();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to your environment before using AI features.");
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

type GenerateStructuredObjectOptions<Output> = {
  task: OpenAITask;
  schema: z.ZodType<Output>;
  schemaName: string;
  instructions: string;
  input: string;
  reasoningEffort?: OpenAIReasoningEffort;
};

export async function generateStructuredObject<Output>({
  task,
  schema,
  schemaName,
  instructions,
  input,
  reasoningEffort = "low"
}: GenerateStructuredObjectOptions<Output>) {
  const response = await getOpenAIClient().responses.parse({
    model: getOpenAIModel(task),
    instructions,
    input,
    reasoning: {
      effort: reasoningEffort
    },
    text: {
      format: zodTextFormat(schema, schemaName)
    }
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI did not return a structured response.");
  }

  return response.output_parsed;
}
