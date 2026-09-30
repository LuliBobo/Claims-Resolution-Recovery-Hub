import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fakeCall } from "./fake";

// The one place Anthropic API calls happen. Every call is a forced tool-use call whose
// input is validated by a zod schema before anything touches the DB.

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2; // SDK-level retries on 429/5xx/connection errors

let client: Anthropic | undefined;
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LlmError("ANTHROPIC_API_KEY is not configured");
  client ??= new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return client;
}

export interface CallJsonOptions<T extends z.ZodType> {
  /** Tool name; also labels the call in error messages. */
  name: string;
  description: string;
  system: string;
  user: string;
  /** Extra content blocks (images, documents) sent alongside `user`. */
  extraContent?: Anthropic.ContentBlockParam[];
  schema: T;
  maxTokens?: number;
}

export async function callClaudeJson<T extends z.ZodType>(
  opts: CallJsonOptions<T>,
): Promise<z.infer<T>> {
  if (process.env.E2E_FAKE_LLM === "1") return fakeCall(opts);
  const anthropic = getClient();
  let response;
  try {
    response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [
        {
          role: "user",
          content: opts.extraContent ? [...opts.extraContent, { type: "text", text: opts.user }] : opts.user,
        },
      ],
      tools: [
        {
          name: opts.name,
          description: opts.description,
          input_schema: z.toJSONSchema(opts.schema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.name },
    });
  } catch (e) {
    throw new LlmError(`${opts.name}: request failed`, e);
  }

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new LlmError(`${opts.name}: no tool output`);
  const parsed = opts.schema.safeParse(block.input);
  if (!parsed.success) {
    throw new LlmError(`${opts.name}: output failed validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
