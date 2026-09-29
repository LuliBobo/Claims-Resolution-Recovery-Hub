import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { callClaudeJson, LlmError } from "@/server/llm/client";

const opts = { name: "t", description: "d", system: "s", user: "u", schema: z.object({ n: z.number() }) };

describe("callClaudeJson", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test";
    create.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns schema-validated tool input and forces the tool", async () => {
    create.mockResolvedValue({ content: [{ type: "tool_use", input: { n: 1 } }] });
    await expect(callClaudeJson(opts)).resolves.toEqual({ n: 1 });
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: "tool", name: "t" });
  });
  it("throws LlmError when output fails validation", async () => {
    create.mockResolvedValue({ content: [{ type: "tool_use", input: { n: "x" } }] });
    await expect(callClaudeJson(opts)).rejects.toBeInstanceOf(LlmError);
  });
  it("throws LlmError when the API call fails or returns no tool output", async () => {
    create.mockRejectedValueOnce(new Error("503"));
    await expect(callClaudeJson(opts)).rejects.toBeInstanceOf(LlmError);
    create.mockResolvedValueOnce({ content: [{ type: "text", text: "hi" }] });
    await expect(callClaudeJson(opts)).rejects.toBeInstanceOf(LlmError);
  });
});
