import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join, isAbsolute } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const require = createRequire(import.meta.url);

/** Prefer the newest installed CLI, including the SDK's native distribution. */
export async function selectNewestClaudeExecutable(
  candidates: string[],
  readVersion: (path: string) => Promise<string> = async (path) =>
    (await runFile(path, ["--version"], { timeout: 3_000, maxBuffer: 16_384 })).stdout,
): Promise<string | undefined> {
  const versions = await Promise.all(candidates.map(async (path) => {
    try {
      const match = (await readVersion(path)).match(/^(\d+)\.(\d+)\.(\d+)(?=\s|$)/m);
      return match ? { path, version: match.slice(1).map(Number) } : undefined;
    } catch {
      return undefined;
    }
  }));
  let newest: { path: string; version: number[] } | undefined;
  for (const candidate of versions) {
    if (!candidate) continue;
    const difference = newest
      ? candidate.version.map((part, index) => part - newest!.version[index]!).find((part) => part !== 0) ?? 0
      : 1;
    if (difference > 0) newest = candidate;
  }
  return newest?.path;
}

let cached: { key: string; expiresAt: number; result: Promise<string | undefined> } | undefined;

export function newestClaudeExecutable(): Promise<string | undefined> {
  const searchPath = process.env.PATH ?? "";
  const home = homedir();
  const key = `${searchPath}\n${home}`;
  if (cached?.key === key && cached.expiresAt > Date.now()) return cached.result;
  const result = (async () => {
    const binary = process.platform === "win32" ? "claude.exe" : "claude";
    const candidates = [
      join(home, ".local", "bin", binary),
      ...searchPath.split(delimiter).filter(isAbsolute).map((directory) => join(directory, binary)),
    ];
    // Resolve from the SDK itself so nested package installations work too.
    const sdkRequire = createRequire(require.resolve("@anthropic-ai/claude-agent-sdk"));
    for (const suffix of ["", "-musl"]) {
      try {
        const manifest = sdkRequire.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}${suffix}/package.json`);
        candidates.push(join(dirname(manifest), binary));
      } catch { /* Optional platform package may not be installed. */ }
    }
    const paths = await Promise.all(candidates.map(async (path) => {
      try {
        await access(path, constants.X_OK);
        return await realpath(path);
      } catch { return undefined; }
    }));
    return selectNewestClaudeExecutable([...new Set(paths.filter((path): path is string => !!path))]);
  })();
  cached = { key, expiresAt: Date.now() + 60_000, result };
  return result;
}
