import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function prompt(idea: string): string {
  return `Turn this plain-language idea into one good GitHub user story for the current repository:

${idea}

1. Verify the current directory is a GitHub repository with gh. Read only relevant repository guidance, code, tests, docs, and issues. Do not edit files.
2. Infer the specific beneficiary, desired outcome, value, context, scope, testable acceptance criteria, and useful out-of-scope boundaries. Do not invent unsupported requirements.
3. Apply INVEST privately. Keep the story negotiable, small enough for one sprint, and focused on one valuable end-to-end scenario rather than technical layers. If the idea is broad, draft the smallest valuable slice and state what was deferred.
4. Present a concise title and Markdown body with: User story, Context, Scope, Acceptance criteria, and Out of scope.
5. Do not create the issue yet. End with: "Reply with corrections or publish."
6. Revise the draft whenever the user gives corrections.
7. Only when the user later replies with the standalone word "publish", create the issue with gh using the approved title and body exactly. Do not add labels, assignees, projects, or milestones. Report the issue URL. If creation fails, stop without retrying.`;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("aweille-racont", {
    description: "Turn a plain-language idea into a refined GitHub user story",
    handler: (args, ctx) => {
      const idea = args.trim();
      if (!idea) {
        ctx.ui.notify("Usage: /aweille-racont <idea>", "warning");
        return;
      }
      pi.sendUserMessage(prompt(idea));
    },
  });
}
