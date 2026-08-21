import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type PullRequest = { number: number; url: string };

function planPrompt(pr: PullRequest): string {
  return `Plan fixes for review findings on PR #${pr.number} (${pr.url}).

1. Read current PR review comments and threads with gh. Identify actionable findings from reviewers, excluding bot acknowledgements and already-resolved items.
2. Inspect relevant code and repository guidance. Do not edit files, run formatting, create commits, or post GitHub comments.
3. Present smallest implementation plan: one numbered item per finding, affected files, intended change, and verification. State findings not to address and why.
4. End with: "Approve with /aweille-arrange-ca apply." Do not implement until user explicitly approves.`;
}

const APPLY_PROMPT = `Implement approved PR-review plan from current conversation.

1. Read CONTRIBUTING.md and plan shown before this request. Re-read current PR review threads with gh. Change only approved, actionable findings.
2. Implement smallest correct changes. Follow repository architecture and testing rules. Run only verification required by CONTRIBUTING.md that applies to changed code.
3. For every addressed review comment, reply in its GitHub review thread using gh api. State precise change and verification. Do not reply to findings not addressed; report them to user instead.
4. Do not commit, open/reopen a PR, or start another review. Stop after reporting.

Report changed files, checks run, and each replied thread.`;

export default function (pi: ExtensionAPI) {
  pi.events.on("pr:reviewed", (pr: PullRequest) => {
    pi.sendUserMessage(planPrompt(pr), { deliverAs: "followUp" });
  });

  pi.registerCommand("aweille-arrange-ca", {
    description: "Plan PR-review fixes, or apply approved plan and reply to addressed threads",
    handler: async (args, ctx) => {
      if (args.trim() !== "apply") {
        ctx.ui.notify("Waiting for pr:reviewed. Use /aweille-arrange-ca apply after approving plan.", "info");
        return;
      }
      if (!await ctx.ui.confirm("Apply approved PR-review plan?", "Changes files and replies to addressed review threads. Does not commit or open PR.")) return;
      pi.sendUserMessage(APPLY_PROMPT);
    },
  });
}
