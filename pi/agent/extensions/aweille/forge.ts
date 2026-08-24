import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GitHost } from "./git-host.ts";

const TIMEOUT = 120_000;

export type ExecResult = { code: number; stdout: string; stderr: string };

export async function exec(pi: ExtensionAPI, cwd: string, cmd: string, args: string[]): Promise<ExecResult> {
  const result = await pi.exec(cmd, args, { cwd, timeout: TIMEOUT });
  return { code: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export async function git(pi: ExtensionAPI, cwd: string, args: string[]): Promise<ExecResult> {
  return exec(pi, cwd, "git", args);
}

export async function cli(pi: ExtensionAPI, cwd: string, host: GitHost, args: string[]): Promise<ExecResult> {
  return exec(pi, cwd, host.cli, args);
}

export async function readContributing(cwd: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, "CONTRIBUTING.md"), "utf8");
  } catch {
    return null;
  }
}

export type RepoState = {
  branch: string;
  status: string;
  diffCheck: string;
  conflictMarkers: boolean;
};

export async function gitFetch(pi: ExtensionAPI, cwd: string): Promise<ExecResult> {
  return git(pi, cwd, ["fetch", "origin"]);
}

export async function gatherRepoState(pi: ExtensionAPI, cwd: string): Promise<RepoState> {
  const [branch, status, diffCheck] = await Promise.all([
    git(pi, cwd, ["branch", "--show-current"]),
    git(pi, cwd, ["status", "--porcelain"]),
    git(pi, cwd, ["diff", "--check"]),
  ]);
  const checkOut = `${diffCheck.stdout}\n${diffCheck.stderr}`.trim();
  return {
    branch: branch.stdout.trim(),
    status: status.stdout.trim(),
    diffCheck: checkOut,
    conflictMarkers: diffCheck.code !== 0 || /^(?:\+<<<<<<<|\+\|\|\|\|\|\|\|)/m.test(checkOut),
  };
}

export async function gitBranchOrFail(pi: ExtensionAPI, cwd: string, name: string): Promise<void> {
  const result = await git(pi, cwd, ["checkout", "-b", name]);
  if (result.code !== 0) fail(result, "git checkout -b");
}

export async function gitCommitOrFail(pi: ExtensionAPI, cwd: string, message: string): Promise<void> {
  const result = await git(pi, cwd, ["commit", "-m", message]);
  if (result.code !== 0) fail(result, "git commit");
}

export async function gitPushOrFail(pi: ExtensionAPI, cwd: string): Promise<void> {
  const result = await git(pi, cwd, ["push", "-u", "origin", "HEAD"]);
  if (result.code !== 0) fail(result, "git push");
}

export async function gitDiff(pi: ExtensionAPI, cwd: string, base: string): Promise<string> {
  for (const range of [`origin/${base}...HEAD`, `${base}...HEAD`]) {
    const result = await git(pi, cwd, ["diff", range]);
    if (result.code === 0 && result.stdout) return result.stdout;
  }
  const fallback = await git(pi, cwd, ["diff", "HEAD"]);
  return fallback.stdout;
}

function fail(result: ExecResult, action: string): never {
  throw new Error(`${action}: ${(result.stderr || result.stdout).trim() || `exit ${result.code}`}`);
}
