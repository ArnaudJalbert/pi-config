import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createChange, watchCi } from "./change.ts";
import { contributingSection, gatherRepoState, gitOk, readContributing, type RepoState } from "./forge.ts";
import { gitHostOrThrow, requireGitHost, type GitHost } from "./git-host.ts";

function prompt(host: GitHost, ctx: { state: RepoState; contributing: string | null }): string {
  return `Open ${host.changeShort} for this repo. Git state is gathered; use tools for git/${host.cli} operations.

## Branch
${ctx.state.branch || "(detached)"}

## Status
\`\`\`
${ctx.state.status || "(clean)"}
\`\`\`

${contributingSection(ctx.contributing, "not found — use repository defaults")}

## Your job (judgment only)
1. If branch is main/master and there are changes, call aweille_branch with a descriptive name per CONTRIBUTING.md.
2. Run only verification commands explicitly required by CONTRIBUTING.md. Record exact command and result.
3. Stage intended files with git add as needed, then call aweille_commit with an imperative message per CONTRIBUTING.md.
4. Call aweille_push, then aweille_open_change with title and body:

Summary

[one concise imperative line per change]

Verification

- [x] \`command\` - result

Closes #issue-number

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
      await gitOk(pi, cwd(), ["checkout", "-b", name], "git checkout -b");
      return { content: [{ type: "text", text: `Branch ${name} created.` }] };
    },
  });

  pi.registerTool({
    name: "aweille_commit",
    label: "Aweille Commit",
    description: "Commit staged changes.",
    parameters: Type.Object({ message: Type.String() }),
    async execute(_id, { message }) {
      await gitOk(pi, cwd(), ["commit", "-m", message], "git commit");
      return { content: [{ type: "text", text: "Committed." }] };
    },
  });

  pi.registerTool({
    name: "aweille_push",
    label: "Aweille Push",
    description: "Push current branch to origin.",
    parameters: Type.Object({}),
    async execute() {
      await gitOk(pi, cwd(), ["push", "-u", "origin", "HEAD"], "git push");
      return { content: [{ type: "text", text: "Pushed to origin." }] };
    },
  });

  pi.registerTool({
    name: "aweille_open_change",
    label: "Aweille Open Change",
    description: "Create PR/MR and announce change:opened.",
    parameters: Type.Object({ title: Type.String(), body: Type.String() }),
    async execute(_id, { title, body }) {
      const host = gitHostOrThrow(cwd());
      const change = await createChange(pi, cwd(), host, title, body);
      pi.events.emit("change:opened", change);
      return { content: [{ type: "text", text: `Opened ${host.changeShort} #${change.number}: ${change.url}` }], details: change };
    },
  });

  pi.registerTool({
    name: "aweille_watch_ci",
    label: "Aweille Watch CI",
    description: "Wait for CI on the current PR/MR.",
    parameters: Type.Object({}),
    async execute() {
      const result = await watchCi(pi, cwd(), gitHostOrThrow(cwd()));
      return { content: [{ type: "text", text: result }] };
    },
  });

  pi.registerCommand("aweille-pousse", {
    description: "Run CONTRIBUTING.md-driven checks, commit, PR/MR creation, and CI watch",
    handler: async (_args, ctx) => {
      const host = requireGitHost(ctx);
      if (!host) return;
      if (!await ctx.ui.confirm(`Open ${host.changeNoun}?`, `May create branch, commit, open ${host.changeShort}, and wait for CI.`)) return;

      await gitOk(pi, ctx.cwd, ["fetch", "origin"], "git fetch");
      const state = await gatherRepoState(pi, ctx.cwd);
      if (state.conflictMarkers) {
        ctx.ui.notify(`Conflict markers found:\n${state.diffCheck}`, "error");
        return;
      }
      pi.sendUserMessage(prompt(host, { state, contributing: await readContributing(ctx.cwd) }));
    },
  });
}
