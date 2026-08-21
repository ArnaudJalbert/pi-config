import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PROMPT = `Review current branch's pull request.

1. Find current PR with gh. If none exists, stop and alert user.
2. Load and follow ponytail-review, then code-review-and-quality. If diff includes frontend code, also load and follow frontend-design-review and frontend-ui-engineering. Review current branch diff against PR base.
3. Never edit code, tests, configuration, or Git history. Findings only.
4. Collect every finding, including source skill, severity, file and line, issue, and concise recommended fix.
5. Post all findings as one Markdown comment on PR. Start comment with <!-- aweille-review -->. On reruns, update existing marked comment instead of adding another. If no findings, post that no findings were found.
6. Call announce_pr_reviewed with PR number and URL only after posting succeeds.
7. Alert user with every finding in final response and a count notification.

Report PR URL and comment URL.`;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "announce_pr_reviewed",
    label: "Announce PR Reviewed",
    description: "Emit pr:reviewed after aweille-check-ca posts its PR review comment.",
    parameters: Type.Object({
      number: Type.Integer({ minimum: 1 }),
      url: Type.String(),
    }),
    async execute(_toolCallId, params) {
      pi.events.emit("pr:reviewed", params);
      return {
        content: [{ type: "text", text: `Announced PR #${params.number} review.` }],
        details: params,
      };
    },
  });

  pi.events.on("pr:opened", () => {
    pi.sendUserMessage(PROMPT, { deliverAs: "followUp" });
  });

  pi.registerCommand("aweille-check-ca", {
    description: "Review PR with ponytail and quality skills; comment findings without changing code",
    handler: async (_args, ctx) => {
      if (!await ctx.ui.confirm("Review pull request?", "Posts findings to current PR. Never changes code.")) return;
      pi.sendUserMessage(PROMPT);
    },
  });
}
