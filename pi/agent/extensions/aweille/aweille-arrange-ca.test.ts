import assert from "node:assert/strict";
import test from "node:test";
import arrangeCa from "./aweille-arrange-ca.ts";

test("arrange-ca selector starts planning current pull request", async () => {
  let handler: ((args: string, ctx: unknown) => unknown) | undefined;
  let message = "";

  arrangeCa({
    events: { on() {} },
    registerTool() {},
    registerCommand(_name: string, options: { handler: typeof handler }) {
      handler = options.handler;
    },
    exec(_command: string, args: string[]) {
      if (args[0] === "api") return { code: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: { comments: { nodes: [] }, reviewThreads: { nodes: [] } } } } }) };
      return { code: 0, stdout: JSON.stringify({ number: 1, url: "https://example.test/pr/1" }) };
    },
    sendUserMessage(value: string) {
      message = value;
    },
  } as never);

  assert.ok(handler);
  await handler("", { cwd: process.cwd(), ui: { select: async () => "Plan fixes", notify() {} } });
  assert.match(message, /Plan fixes for PR #1/);
});
