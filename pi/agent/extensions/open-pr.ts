import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROMPT = `Run PR workflow for current repository.

1. Read CONTRIBUTING.md first. Follow its contribution and commit rules.
2. Run only tests, linting, formatting, and type checks explicitly required by CONTRIBUTING.md. If it does not name any, run none. Apply formatting only when CONTRIBUTING.md requires it.
3. Preserve all existing work. Never reset, discard, or stash changes. Fetch origin. If current branch is main or does not have its own branch, create a descriptive branch. Ensure branch is based on up-to-date origin/main without overwriting work. If this cannot be done without losing work, stop and explain.
4. Resolve any merge conflicts and run git diff --check. Do not open PR while conflicts remain.
5. Commit all intended changes. Use CONTRIBUTING.md commit guidance, else concise imperative commit message.
6. Open GitHub PR with gh. Use this body exactly:

Summary

    execute UpdateCinemaUseCase directly from cinema update
    split selection, field collection, execution, and output helpers
    remove obsolete CinemaController.update delegation and wiring

Verification

    uv run pytest apps/marquise-cli/tests/ -q
    uv run pytest packages/marquise-core/tests/unit_tests/infrastructure/controllers/test_cinema_controller.py packages/marquise-core/tests/unit_tests/test_bootstrap.py packages/marquise-core/tests/unit_tests/infrastructure/di/test_container.py -q
    uv run ruff format --check .
    uv run ruff check .
    uv run ty check packages/marquise-core/src

Closes #167

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
