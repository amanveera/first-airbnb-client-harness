import { stdout } from "node:process";

const colorsEnabled = Boolean(stdout.isTTY && !process.env.NO_COLOR);

function paint(code, text) {
  return colorsEnabled ? `\u001B[${code}m${text}\u001B[0m` : text;
}

const color = {
  cyan: (text) => paint("36", text),
  green: (text) => paint("32", text),
  yellow: (text) => paint("33", text),
  red: (text) => paint("31", text),
  dim: (text) => paint("2", text),
  bold: (text) => paint("1", text),
};

function linesFrom(value) {
  return String(value ?? "").split("\n");
}

function preview(value, maximumLines = 24) {
  const lines = linesFrom(value);

  if (lines.length <= maximumLines) {
    return lines;
  }

  return [
    ...lines.slice(0, maximumLines),
    color.dim(`… ${lines.length - maximumLines} more line(s) hidden from the UI`),
  ];
}

function removeSingleCodeFence(text) {
  const match = String(text)
    .trim()
    .match(/^```[^\n]*\n([\s\S]*?)\n?```$/);

  return match ? match[1] : text;
}

function card(title, lines = [], accent = color.cyan) {
  console.log();
  console.log(accent(`┌─ ${title}`));

  for (const line of lines) {
    console.log(`│  ${line}`);
  }

  console.log(accent("└─"));
}

function labelForRole(role) {
  if (role === "user") return color.cyan("you");
  if (role === "assistant") return color.green("assistant");
  return color.yellow("tool");
}

export const ui = {
  prompt() {
    return `${color.cyan(color.bold("you"))} ${color.dim("›")} `;
  },

  showWelcome({ modelName, toolCount }) {
    console.log();
    console.log(color.cyan("╭──────────────────────────────────────────────╮"));
    console.log(color.cyan("│") + color.bold("  Aldrin Client CLI") + "  " + color.dim("your local AI harness") + color.cyan("  │"));
    console.log(color.cyan("╰──────────────────────────────────────────────╯"));
    console.log(`${color.dim("Model:")} ${modelName}   ${color.dim("MCP tools:")} ${toolCount}`);
    console.log(color.dim("Type /help for commands. Ctrl-D or /exit to leave."));
  },

  showThinking() {
    console.log(color.dim("\n  ◌ Thinking…"));
  },

  showToolStarted({ toolName, input }) {
    card(
      `TOOL · ${toolName}`,
      [color.dim("Input:"), ...preview(JSON.stringify(input, null, 2), 12)],
      color.yellow
    );
  },

  showToolResult({ toolName, text, isError }) {
    const heading = isError ? `TOOL ERROR · ${toolName}` : `TOOL RESULT · ${toolName}`;
    card(heading, preview(text), isError ? color.red : color.green);
  },

  showApprovalRequest(approvalRequest, input) {
    if (approvalRequest.kind === "external") {
      card(
        approvalRequest.title,
        [
          color.dim(approvalRequest.explanation),
          color.dim(`Tool: ${approvalRequest.action}`),
          color.dim("Input:"),
          ...preview(JSON.stringify(input, null, 2), 12),
        ],
        color.yellow
      );
      return;
    }

    card(
      approvalRequest.title,
      [
        color.dim(approvalRequest.explanation),
        color.bold(color.cyan(`$ ${approvalRequest.action}`)),
      ],
      color.yellow
    );
  },

  showApprovalDecision(approved, approvalRequest) {
    if (approved) {
      const verb =
        approvalRequest.kind === "external"
          ? "sending external request"
          : "running";
      console.log(
        color.green(`  ✓ Approved — ${verb}: ${approvalRequest.action}`)
      );
    } else {
      const result =
        approvalRequest.kind === "external"
          ? "the external request was not sent."
          : "the command was not run.";
      console.log(color.yellow(`  • Rejected — ${result}`));
    }
  },

  showAssistant(text) {
    const cleanText = removeSingleCodeFence(text);
    card("ASSISTANT", preview(cleanText, 36), color.green);
  },

  showInfo(message) {
    console.log(color.cyan(`\n  ℹ ${message}`));
  },

  showError(message) {
    console.log(color.red(`\n  ✕ ${message}`));
  },

  showHelp() {
    card(
      "COMMANDS",
      [
        "/tools                 Show connected MCP tools",
        "/servers               Show connected MCP servers",
        "/models                Show model choices",
        "/model <id>            Change model (starts a new chat)",
        "/history               Show this conversation",
        "/tokens                Show context and session token usage",
        "/clear                 Start a fresh conversation",
        "/exit                  Save transcript and quit",
      ],
      color.cyan
    );
  },

  showTools(tools) {
    card(
      `CONNECTED MCP TOOLS · ${tools.length}`,
      tools.flatMap((tool) => [
        color.bold(tool.name),
        color.dim(`  ${tool.description}`),
      ]),
      color.cyan
    );
  },

  showServers(servers) {
    card(
      "MCP SERVERS",
      servers.flatMap((server) => [
        `${color.bold(server.name)} ${server.connected ? color.green("connected") : color.red("not connected")}`,
        color.dim(`  ${server.command} ${server.args.join(" ")}`),
      ]),
      color.cyan
    );
  },

  showModels(models, selectedModelId) {
    card(
      "AVAILABLE MODELS",
      models.flatMap((model) => {
        const selected = model.id === selectedModelId ? color.green("  selected") : "";
        return [
          `${color.bold(model.id)}${selected}`,
          color.dim(`  ${model.description}`),
        ];
      }),
      color.cyan
    );
  },

  showCurrentModel(modelName) {
    card("CURRENT MODEL", [color.bold(modelName)], color.cyan);
  },

  showTokenStatus(status) {
    card(
      "TOKEN STATUS",
      [
        color.dim(status.method),
        `Context now: ${color.bold(`${status.context.total} tokens`)}`,
        color.dim(
          `  user ${status.context.byRole.user} · tool ${status.context.byRole.tool} · assistant ${status.context.byRole.assistant}`
        ),
        `Session: ${status.session.providerCalls} API call(s) · ${color.bold(`${status.session.totalTokens} tokens`)}`,
        color.dim(
          `  input ${status.session.inputTokens} · output ${status.session.outputTokens} · cached ${status.session.cachedInputTokens}`
        ),
      ],
      color.cyan
    );
  },

  showHistory(messages) {
    if (messages.length === 0) {
      this.showInfo("No conversation yet.");
      return;
    }

    console.log();
    console.log(color.cyan("┌─ CONVERSATION HISTORY"));
    for (const message of messages) {
      const name = message.role === "tool" ? ` (${message.name})` : "";
      console.log(`│  ${labelForRole(message.role)}${name}`);
      for (const line of preview(message.content, 10)) {
        console.log(`│    ${line}`);
      }
    }
    console.log(color.cyan("└─"));
  },
};
