import assert from "node:assert/strict";
import test from "node:test";
import { TokenTracker } from "./token-tracker.js";

test("tracks estimated context and cumulative provider usage", () => {
  const tracker = new TokenTracker();
  const messages = [
    { role: "user", content: "what time is it" },
    { role: "tool", name: "get_current_time", content: "10:00 AM" },
  ];

  const context = tracker.estimateContext(messages);
  assert.ok(context.total > 0);
  assert.ok(context.byRole.user > 0);
  assert.ok(context.byRole.tool > 0);

  tracker.recordProviderCall(messages, "The current time is 10:00 AM.");

  const status = tracker.getStatus(messages);
  assert.equal(status.session.providerCalls, 1);
  assert.ok(status.session.inputTokens > 0);
  assert.ok(status.session.outputTokens > 0);
  assert.equal(
    status.session.totalTokens,
    status.session.inputTokens + status.session.outputTokens
  );
});

test("uses provider-reported token usage when it is available", () => {
  const tracker = new TokenTracker();
  const messages = [{ role: "user", content: "hello" }];

  tracker.recordProviderCall(messages, "Hello!", {
    inputTokens: 12,
    outputTokens: 8,
    cachedInputTokens: 3,
  });

  const status = tracker.getStatus(messages);
  assert.equal(status.method, "provider-reported usage from the API");
  assert.equal(status.session.inputTokens, 12);
  assert.equal(status.session.outputTokens, 8);
  assert.equal(status.session.cachedInputTokens, 3);
  assert.equal(status.session.totalTokens, 20);
});
