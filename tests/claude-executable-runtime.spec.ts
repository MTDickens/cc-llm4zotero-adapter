import { afterEach, describe, expect, it, vi } from "vitest";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { newestClaudeExecutable } from "../src/providers/claude-executable.js";
import { ClaudeAgentSdkRuntimeClient } from "../src/providers/claude-agent-sdk-runtime-client.js";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }));
vi.mock("../src/providers/claude-executable.js", () => ({ newestClaudeExecutable: vi.fn() }));

describe("runtime executable wiring", () => {
  afterEach(() => vi.resetAllMocks());

  it("uses the selected executable when discovering the model catalog", async () => {
    vi.mocked(newestClaudeExecutable).mockResolvedValue("/installed/claude");
    vi.mocked(query).mockReturnValue({
      supportedModels: async () => [{ value: "sonnet", resolvedModel: "claude-sonnet-5-5" }],
      close() {},
      async return() { return { done: true, value: undefined }; },
    } as any);
    const runtime = new ClaudeAgentSdkRuntimeClient();
    expect(await runtime.listModels({ forceRefresh: true })).toContainEqual({
      value: "sonnet", resolvedModel: "claude-sonnet-5-5",
    });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ pathToClaudeCodeExecutable: "/installed/claude" }),
    }));
  });

  it("lets the SDK choose its default when no executable is identified", async () => {
    vi.mocked(newestClaudeExecutable).mockResolvedValue(undefined);
    const runtime = new ClaudeAgentSdkRuntimeClient();
    const load = runtime as unknown as {
      loadQuery(): Promise<(args: { prompt: string; options: Record<string, unknown> }) => unknown>;
    };
    const invoke = await load.loadQuery();
    invoke({ prompt: "hello", options: { model: "sonnet" } });
    expect(query).toHaveBeenCalledWith({ prompt: "hello", options: { model: "sonnet" } });
  });

  it("also uses the selected executable for completions", async () => {
    vi.mocked(newestClaudeExecutable).mockResolvedValue("/installed/claude");
    vi.mocked(query).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "result", subtype: "success", result: "{}" };
      },
      close() {},
    } as any);
    const runtime = new ClaudeAgentSdkRuntimeClient();
    expect(await runtime.completeStructured({ prompt: "hello", model: "sonnet", timeoutMs: 1000 })).toEqual({ text: "{}" });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ model: "sonnet", pathToClaudeCodeExecutable: "/installed/claude" }),
    }));
  });
});
