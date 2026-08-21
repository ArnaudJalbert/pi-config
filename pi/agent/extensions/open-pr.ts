import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROMPT = `Run PR workflow for current repository.

1. Read CONTRIBUTING.md first. Follow its contribution and commit rules.
2. Run only tests, linting, formatting, and type checks explicitly required by CONTRIBUTING.md. If it does not name any, run none. Apply formatting only when CONTRIBUTING.md requires it.
3. Preserve all existing work. Never reset, discard, or stash changes. Fetch origin. Use CONTRIBUTING.md branch naming rules when present. If current branch is main or does not have its own branch, create a descriptive branch. Ensure branch is based on up-to-date origin/main without overwriting work. If this cannot be done without losing work, stop and explain.
4. Resolve any merge conflicts and run git diff --check. Do not open PR while conflicts remain.
5. Commit all intended changes. Use CONTRIBUTING.md commit guidance, else concise imperative commit message.
6. Open GitHub PR with gh. Use this body structure. Every Summary line must be concise, imperative, and descriptive. Verification must be actionable Markdown checklist items, one per check actually run, with exact command and result. Omit Closes when no issue number is known:

Summary

[one concise imperative, descriptive change per line]

Verification

- [x] `command run` - result

Closes #issue-number

7. Wait for CI using gh. If any check fails, do not change code. Report failed checks and propose concrete fix.

Report branch, commit, PR URL, checks run, and CI result.`;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("open-pr", {
    description: "Run CONTRIBUTING.md-driven checks, commit, PR creation, and CI watch",
    handler: async (_args, ctx) => {
      if (!await ctx.ui.confirm("Open pull request?", "May create branch, commit, open PR, and wait for CI.")) return;
      pi.sendUserMessage(PROMPT);
    },
  });
}
