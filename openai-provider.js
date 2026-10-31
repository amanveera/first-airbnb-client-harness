import OpenAI from "openai";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-6-astra";

function toFunctionTools(mcpTools) {
  return mcpTools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema || {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  }));
}

function toResponseInputItems(output) {
  return output.map((item) => {
    if (item.type === "function_call") {
      return {
        type: "function_call",
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      };
    }

    if (item.type === "message") {
      return {
        role: "assistant",
        content: item.content,
      };
    }

    return item;
  });
}

function getUsage(response) {
  if (!response.usage) {
    return undefined;
  }

  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    totalTokens: response.usage.total_tokens,
    cachedInputTokens: response.usage.input_tokens_details?.cached_tokens || 0,
  };
}

/**
 * The adapter between our AgentRunner contract and the OpenAI Responses API.
 * It turns MCP tool schemas into function tools, then preserves each tool-call
 * ID so the result can be returned to the model on the next loop step.
 */
export class OpenAIProvider {
  constructor({ model = DEFAULT_MODEL } = {}) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is not set. Set it in your own terminal before selecting the OpenAI model."
      );
    }

    this.modelId = "openai";
    this.model = model;
    this.name = `openai:${model}`;
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.input = [];
  }

  reset() {
    this.input = [];
  }

  async generate({ messages, tools }) {
    const latestMessage = messages[messages.length - 1];

    if (latestMessage.role === "user") {
      this.input.push({ role: "user", content: latestMessage.content });
    } else if (latestMessage.role === "tool") {
      if (!latestMessage.callId) {
        throw new Error("The tool result is missing the model's tool-call ID.");
      }

      this.input.push({
        type: "function_call_output",
        call_id: latestMessage.callId,
        output: latestMessage.content,
      });
    } else {
      throw new Error("OpenAIProvider expected a user message or a tool result.");
    }

    const response = await this.client.responses.create({
      model: this.model,
      instructions:
        "You are a helpful assistant inside a local learning CLI. Use the provided tools when they are needed. Only state tool results after receiving them. The UI displays tool results separately, so after a tool call briefly explain what the result means; do not wrap a plain terminal result in a Markdown code fence. The run_workspace_command tool is limited to named read-only actions and the CLI asks the user for approval before it runs. Keep answers clear and concise.",
      input: this.input,
      tools: toFunctionTools(tools),
      parallel_tool_calls: false,
      store: false,
    });

    this.input.push(...toResponseInputItems(response.output));

    const functionCalls = response.output.filter(
      (item) => item.type === "function_call"
    );

    if (functionCalls.length > 1) {
      throw new Error("This learning CLI supports one tool call at a time.");
    }

    if (functionCalls.length === 1) {
      const toolCall = functionCalls[0];
      let toolInput;

      try {
        toolInput = JSON.parse(toolCall.arguments);
      } catch {
        throw new Error(
          `OpenAI returned invalid JSON arguments for ${toolCall.name}.`
        );
      }

      return {
        type: "tool_call",
        toolName: toolCall.name,
        input: toolInput,
        callId: toolCall.call_id,
        usage: getUsage(response),
      };
    }

    return {
      type: "final",
      text: response.output_text || "(The model returned no text.)",
      usage: getUsage(response),
    };
  }
}
