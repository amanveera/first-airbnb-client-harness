import assert from "node:assert/strict";
import test from "node:test";
import { AgentRunner } from "./agent-runner.js";

test("does not run a terminal command when the user rejects it", async () => {
  let toolCalls = 0;
  const toolManager = {
    async listTools() {
      return [];
    },
    async callTool() {
      toolCalls += 1;
      return { content: [{ type: "text", text: "should not run" }] };
    },
  };

  let providerCalls = 0;
  const provider = {
    async generate({ messages }) {
      providerCalls += 1;

      if (providerCalls === 1) {
        return {
          type: "tool_call",
          toolName: "run_workspace_command",
          input: { action: "git_status" },
          callId: "call_123",
        };
      }

      assert.match(messages.at(-1).content, /denied permission/);
      return { type: "final", text: "Okay, I will not run it." };
    },
  };

  const runner = new AgentRunner(provider, toolManager, {
    requestApproval: async () => false,
  });

  const reply = await runner.runTurn("Show git status");

  assert.equal(reply, "Okay, I will not run it.");
  assert.equal(toolCalls, 0);
});

test("asks before sending an Airbnb search to an external MCP server", async () => {
  let toolCalls = 0;
  const toolManager = {
    async listTools() {
      return [];
    },
    async callTool() {
      toolCalls += 1;
      return { content: [{ type: "text", text: "should not run" }] };
    },
  };

  let providerCalls = 0;
  const provider = {
    async generate() {
      providerCalls += 1;
      return providerCalls === 1
        ? {
            type: "tool_call",
            toolName: "airbnb__airbnb_search",
            input: { location: "Austin, TX" },
            callId: "call_airbnb",
          }
        : { type: "final", text: "Okay, I will not search Airbnb." };
    },
  };

  let receivedRequest;
  const runner = new AgentRunner(provider, toolManager, {
    requestApproval: async ({ approvalRequest }) => {
      receivedRequest = approvalRequest;
      return false;
    },
  });

  await runner.runTurn("Search Airbnb in Austin");

  assert.equal(receivedRequest.kind, "external");
  assert.equal(toolCalls, 0);
});
