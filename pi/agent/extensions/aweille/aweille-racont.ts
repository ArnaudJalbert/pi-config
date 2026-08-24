import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createIssue } from "./change.ts";
import { gitHostOrThrow, requireGitHost, type GitHost } from "./git-host.ts";

function prompt(host: GitHost, idea: string): string {
  return `Turn this idea into a user story for the current ${host.kind} repo (${host.cli}):

${idea}

1. Read relevant guidance, code, tests, docs, and issues. Do not edit files.
2. Infer beneficiary, outcome, value, context, scope, acceptance criteria, and out-of-scope boundaries. Do not invent requirements.
3. Apply INVEST privately. If broad, draft the smallest valuable slice and state deferrals.
4. Present title and Markdown body: User story, Context, Scope, Acceptance criteria, Out of scope.
5. End with: "Reply with corrections or publish."
6. On user corrections, revise the draft.
7. When user replies with standalone "publish", call aweille_create_issue with the approved title and body exactly. No labels, assignees, projects, or milestones.`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "aweille_create_issue",
    label: "Aweille Create Issue",
    description: "Create a GitHub/GitLab issue with approved title and body.",
    parameters: Type.Object({ title: Type.String(), body: Type.String() }),
    async execute(_id, { title, body }) {
      const cwd = process.cwd();
      const url = await createIssue(pi, cwd, gitHostOrThrow(cwd), title, body);
      return { content: [{ type: "text", text: `Issue created: ${url}` }], details: { url } };
    },
  });

  pi.registerCommand("aweille-racont", {
    description: "Turn a plain-language idea into a refined user story issue",
    handler: (args, ctx) => {
      const idea = args.trim();
      if (!idea) {
        ctx.ui.notify("Usage: /aweille-racont <idea>", "warning");
        return;
      }
      const host = requireGitHost(ctx);
      if (!host) return;
      pi.sendUserMessage(prompt(host, idea));
    },
  });
}
