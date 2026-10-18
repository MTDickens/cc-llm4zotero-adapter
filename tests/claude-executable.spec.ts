import { describe, expect, it } from "vitest";
import { selectNewestClaudeExecutable } from "../src/providers/claude-executable.js";

describe("Claude executable selection", () => {
  const select = (versions: Record<string, string>) => selectNewestClaudeExecutable(
    Object.keys(versions), async (path) => versions[path]!,
  );

  it("uses the newer local CLI instead of the SDK copy", async () => {
    expect(await select({ local: "2.1.285 (Claude Code)", sdk: "2.1.280 (Claude Code)" })).toBe("local");
  });

  it("uses the SDK copy when it is newer and compares numbers numerically", async () => {
    expect(await select({ local: "2.1.99 (Claude Code)", sdk: "2.1.280 (Claude Code)" })).toBe("sdk");
    expect(await select({ local: "3.0.0 (Claude Code)", sdk: "2.9.999 (Claude Code)" })).toBe("local");
  });

  it("keeps the first candidate for equal versions", async () => {
    expect(await select({ local: "2.1.285 (Claude Code)", sdk: "2.1.285 (Claude Code)" })).toBe("local");
  });

  it("ignores broken binaries and unrecognized versions", async () => {
    expect(await selectNewestClaudeExecutable(["broken", "invalid", "sdk"], async (path) => {
      if (path === "broken") throw new Error("not executable");
      return path === "invalid" ? "unknown" : "2.1.280 (Claude Code)";
    })).toBe("sdk");
    expect(await select({ invalid: "unknown" })).toBeUndefined();
  });
});
