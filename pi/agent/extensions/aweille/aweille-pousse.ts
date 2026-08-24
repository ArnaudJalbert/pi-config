import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createChange, watchCi } from "./change.ts";
import { gatherRepoState, gitBranchOrFail, gitCommitOrFail, gitFetch, gitPushOrFail, readContributing, type RepoState } from "./forge.ts";
import { gitHost, requireGitHost, type GitHost } from "./git-host.ts";

const DEFAULT_BRANCHES = new Set(["main", "master"]);

function prompt(host: GitHost, ctx: { state: RepoState; contributing: string | null }): string {
  const contributing = ctx.contributing?.trim()
    ? `## CONTRIBUTING.md\n\n${ctx.contributing}`
    : "## CONTRIBUTING.md\n\n(not found — use repository defaults)";

  return `Open ${host.changeShort} for this repo. Git state is already gathered; use tools for git/${host.cli} operations.

## Branch
${ctx.state.branch || "(detached)"}

## Status
\`\`\`
${ctx.state.status || "(clean)"}
\`\`\`

${contributing}

## Your job (judgment only)
1. If branch is ${[...DEFAULT_BRANCHES].join("/")} and there are changes, call aweille_branch with a descriptive name per CONTRIBUTING.md.
2. Run only verification commands explicitly required by CONTRIBUTING.md. Record exact command and result.
3. Stage intended files with git add as needed, then call aweille_commit with an imperative message per CONTRIBUTING.md.
4. Call aweille_push, then aweille_open_change with title and body:

Summary

[one concise imperative line per change]

Verification

- [x] \`command\` - result

Closes #issue-number

5. Call aweille_watch_ci. If CI fails, do not change code; report failures and propose fixes.

Do not reset, discard, or stash. Never open ${host.changeShort} while conflicts remain.`;
}

export default function (pi: ExtensionAPI) {
  const cwd = () => process.cwd();

  pi.registerTool({
    name: "aweille_branch",
    label: "Aweille Branch",
    description: "Create and checkout a new branch.",
    parameters: Type.Object({ name: Type.String() }),
    async execute(_id, { name }) {
      await gitBranchOrFail(pi, cwd(), name);
      return { content: [{ type: "text", text: `Branch ${name} created.` }] };
    },
  });

  pi.registerTool({
    name: "aweille_commit",
    label: "Aweille Commit",
    description: "Commit staged changes.",
    parameters: Type.Object({ message: Type.String() }),
    async execute(_id, { message }) {
      await gitCommitOrFail(pi, cwd(), message);
      return { content: [{ type: "text", text: "Committed." }] };
    },
  });

  pi.registerTool({
    name: "aweille_push",
    label: "Aweille Push",
    description: "Push current branch to origin.",
    parameters: Type.Object({}),
    async execute() {
      await gitPushOrFail(pi, cwd());
      return { content: [{ type: "text", text: "Pushed to origin." }] };
    },
  });

  pi.registerTool({
    name: "aweille_open_change",
    label: "Aweille Open Change",
    description: "Create PR/MR and announce change:opened.",
    parameters: Type.Object({ title: Type.String(), body: Type.String() }),
    async execute(_id, { title, body }) {
      const host = gitHost(cwd());
      if ("error" in host) throw new Error(host.error);
      const change = await createChange(pi, cwd(), host, title, body);
      pi.events.emit("change:opened", change);
      return {
        content: [{ type: "text", text: `Opened ${host.changeShort} #${change.number}: ${change.url}` }],
        details: change,
      };
    },
  });

  pi.registerTool({
    name: "aweille_watch_ci",
    label: "Aweille Watch CI",
    description: "Wait for CI on the current PR/MR.",
    parameters: Type.Object({}),
    async execute() {
      const host = gitHost(cwd());
      if ("error" in host) throw new Error(host.error);
      const result = await watchCi(pi, cwd(), host);
      return { content: [{ type: "text", text: result }] };
    },
  });

  pi.registerCommand("aweille-pousse", {
    description: "Run CONTRIBUTING.md-driven checks, commit, PR/MR creation, and CI watch",
    handler: async (_args, ctx) => {
      const host = requireGitHost(ctx);
      if (!host) return;
      if (!await ctx.ui.confirm(`Open ${host.changeNoun}?`, `May create branch, commit, open ${host.changeShort}, and wait for CI.`)) return;

      await gitFetch(pi, ctx.cwd);
      const state = await gatherRepoState(pi, ctx.cwd);
      if (state.conflictMarkers) {
        ctx.ui.notify(`Conflict markers found:\n${state.diffCheck}`, "error");
        return;
      }

      pi.sendUserMessage(prompt(host, { state, contributing: await readContributing(ctx.cwd) }));
    },
  });
}
