import { TokenTracker } from "./token-tracker.js";
import { getApprovalRequest } from "./tool-approval-policy.js";
import { normalizeToolInput } from "./tool-input-normalizer.js";

function getTextFromToolResult(result) {
  const textParts = result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text);

  return textParts.join("\n") || "(The tool returned no text.)";
}

export class AgentRunner {
  constructor(
    provider,
    toolManager,
    { requestApproval = async () => true, onEvent = async () => {} } = {}
  ) {
    this.provider = provider;
    this.toolManager = toolManager;
    this.requestApproval = requestApproval;
    this.onEvent = onEvent;
    this.messages = [];
    this.tokenTracker = new TokenTracker();
  }

  setProvider(provider) {
    this.provider = provider;
  }

  async getAvailableTools() {
    return this.toolManager.listTools();
  }

  async runTurn(userText) {
    this.messages.push({
      role: "user",
      content: userText,
    });

    const tools = await this.getAvailableTools();

    for (let step = 1; step <= 5; step += 1) {
      await this.onEvent({ type: "thinking", step });

      const response = await this.provider.generate({
        messages: this.messages,
        tools,
      });

      const responseText =
        response.type === "final"
          ? response.text
          : JSON.stringify({
              type: response.type,
              toolName: response.toolName,
              input: response.input,
            });

      this.tokenTracker.recordProviderCall(
        this.messages,
        responseText,
        response.usage
      );

      if (response.type === "final") {
        this.messages.push({
          role: "assistant",
          content: response.text,
        });

        return response.text;
      }

      if (response.type === "tool_call") {
        const normalized = normalizeToolInput(
          response.toolName,
          response.input
        );
        const toolInput = normalized.input;

        if (normalized.removedFields.length > 0) {
          await this.onEvent({
            type: "tool_input_normalized",
            toolName: response.toolName,
            removedFields: normalized.removedFields,
          });
        }

        const approvalRequest = getApprovalRequest(
          response.toolName,
          toolInput
        );

        if (approvalRequest) {
          const approved = await this.requestApproval({
            toolName: response.toolName,
            input: toolInput,
            approvalRequest,
          });

          if (!approved) {
            await this.onEvent({
              type: "tool_denied",
              toolName: response.toolName,
              input: toolInput,
            });

            this.messages.push({
              role: "tool",
              name: response.toolName,
              callId: response.callId,
              content:
                approvalRequest.kind === "external"
                  ? "The user denied permission to make this external MCP request. Do not claim that it was sent."
                  : "The user denied permission to run this terminal command. Do not claim that it ran.",
            });

            continue;
          }
        }

        await this.onEvent({
          type: "tool_started",
          toolName: response.toolName,
          input: toolInput,
        });

        const result = await this.toolManager.callTool(
          response.toolName,
          toolInput
        );

        const toolText = getTextFromToolResult(result);

        await this.onEvent({
          type: "tool_result",
          toolName: response.toolName,
          input: toolInput,
          text: toolText,
          isError: Boolean(result.isError),
        });

        this.messages.push({
          role: "tool",
          name: response.toolName,
          callId: response.callId,
          content: result.isError ? `Tool error: ${toolText}` : toolText,
        });

        continue;
      }

      throw new Error(`Unknown provider response type: ${response.type}`);
    }

    throw new Error("The agent stopped after 5 steps.");
  }

  getHistory() {
    return this.messages;
  }

  clear() {
    this.messages = [];
    this.provider.reset?.();
  }

  getTokenStatus() {
    return this.tokenTracker.getStatus(this.messages);
  }
}
