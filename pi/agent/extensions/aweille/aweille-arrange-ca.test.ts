import assert from "node:assert/strict";
import test from "node:test";
import arrangeCa from "./aweille-arrange-ca.ts";

test("manual command starts planning current pull request", async () => {
  let handler: ((args: string, ctx: unknown) => unknown) | undefined;
  let message = "";

  arrangeCa({
    events: { on() {} },
    registerTool() {},
    registerCommand(_name: string, options: { handler: typeof handler }) {
      handler = options.handler;
    },
    exec(_command: string, args: string[]) {
      if (args.includes("comments")) return { code: 0, stdout: '{"comments":[]}' };
      return { code: 0, stdout: '{"number":1,"url":"https://example.test/pr/1"}' };
    },
    sendUserMessage(value: string) {
      message = value;
    },
  } as never);

  assert.ok(handler);
  await handler("", { ui: { confirm: async () => true }, cwd: process.cwd() });
  assert.match(message, /Plan fixes for PR #1/);
});
