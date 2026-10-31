import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { AgentRunner } from "./agent-runner.js";
import { McpToolManager } from "./mcp-tool-manager.js";
import { loadMcpServerConfig } from "./mcp-config.js";
import { createProvider, listProviderModels } from "./provider-registry.js";
import { TranscriptStore } from "./transcript-store.js";
import { ui } from "./terminal-ui.js";

const mcpConfigPath = fileURLToPath(
  new URL("./mcp_config.json", import.meta.url)
);

const rl = createInterface({ input, output });
let provider = createProvider("scripted-standard");
const transcriptDirectory = fileURLToPath(
  new URL("./transcripts/", import.meta.url)
);
const transcriptStore = new TranscriptStore(transcriptDirectory);
let runner = null;
let toolManager = null;

async function requestToolApproval({ input: toolInput, approvalRequest }) {
  if (approvalRequest.kind === "invalid") {
    ui.showError(approvalRequest.explanation);
    return false;
  }

  ui.showApprovalRequest(approvalRequest, toolInput);

  try {
    const prompt =
      approvalRequest.kind === "external"
        ? "Send external request? [y/N] "
        : "Approve command? [y/N] ";
    const answer = (
      await rl.question(prompt)
    ).trim().toLowerCase();
    const approved = answer === "y" || answer === "yes";

    ui.showApprovalDecision(approved, approvalRequest);
    return approved;
  } catch (error) {
    if (error?.code === "ERR_USE_AFTER_CLOSE") {
      return false;
    }

    throw error;
  }
}

async function handleAgentEvent(event) {
  if (event.type === "thinking") {
    ui.showThinking();
    return;
  }

  if (event.type === "tool_input_normalized") {
    ui.showInfo(
      `Adjusted ${event.toolName}: omitted zero-value ${event.removedFields.join(
        ", "
      )} fields for this provider.`
    );
    return;
  }

  if (event.type === "tool_started") {
    // Terminal commands already have a richer approval card above.
    if (!event.toolName.endsWith("__run_workspace_command")) {
      ui.showToolStarted(event);
    }
    return;
  }

  if (event.type === "tool_result") {
    ui.showToolResult(event);
  }
}

try {
  const serverConfigs = await loadMcpServerConfig(mcpConfigPath);
  toolManager = new McpToolManager(serverConfigs);
  await toolManager.connect();

  runner = new AgentRunner(provider, toolManager, {
    requestApproval: requestToolApproval,
    onEvent: handleAgentEvent,
  });

  const initialTools = await runner.getAvailableTools();
  ui.showWelcome({
    modelName: provider.name,
    toolCount: initialTools.length,
  });

  while (true) {
    let answer;

    try {
      answer = (await rl.question(ui.prompt())).trim();
    } catch (error) {
      // Ctrl-D (or piped input ending) closes readline before question resolves.
      if (error?.code === "ERR_USE_AFTER_CLOSE") {
        break;
      }

      throw error;
    }

    if (answer === "/exit") {
      break;
    }

    if (answer === "/help") {
      ui.showHelp();
      continue;
    }

    if (answer === "/tokens") {
      ui.showTokenStatus(runner.getTokenStatus());
      continue;
    }

    if (answer === "/tools") {
      ui.showTools(await runner.getAvailableTools());
      continue;
    }

    if (answer === "/servers") {
      ui.showServers(toolManager.listServers());
      continue;
    }

    if (answer === "/models") {
      ui.showModels(listProviderModels(), provider.modelId);
      continue;
    }

    if (answer === "/model") {
      ui.showCurrentModel(provider.name);
      ui.showInfo("Use /models to list choices or /model <id> to switch.");
      continue;
    }

    if (answer.startsWith("/model ")) {
      const modelId = answer.slice("/model ".length).trim();

      try {
        const nextProvider = createProvider(modelId);

        runner.clear();
        provider = nextProvider;
        runner.setProvider(nextProvider);
        ui.showInfo(`Model changed to ${provider.name}. Conversation cleared.`);
      } catch (error) {
        ui.showError(`Model change failed: ${error.message}`);
      }

      continue;
    }

    if (answer === "/history") {
      ui.showHistory(runner.getHistory());
      continue;
    }

    if (answer === "/clear") {
      runner.clear();
      ui.showInfo("Conversation cleared.");
      continue;
    }

    if (answer === "") {
      continue;
    }

    try {
      ui.showAssistant(await runner.runTurn(answer));
    } catch (error) {
      ui.showError(error.message);
    }
  }
} finally {
  rl.close();

  if (runner && runner.getHistory().length > 0) {
    try {
      const tools = await runner.getAvailableTools();
      const transcriptPath = await transcriptStore.save({
        messages: runner.getHistory(),
        providerName: provider.name,
        tools,
        tokenStatus: runner.getTokenStatus(),
      });

      if (transcriptPath) {
        ui.showInfo(`Transcript saved: ${transcriptPath}`);
      }
    } catch (error) {
      ui.showError(`Transcript save failed: ${error.message}`);
    }
  }

  await toolManager?.close();
}

ui.showInfo("Goodbye!");
