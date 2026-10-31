import { formatSafeWorkspaceCommand } from "./local-tools/safe-command-policy.js";

function baseToolName(toolName) {
  return toolName.split("__").at(-1);
}

/** The harness, rather than the model, decides which tool calls need consent. */
export function getApprovalRequest(toolName, input) {
  if (baseToolName(toolName) === "run_workspace_command") {
    try {
      return {
        kind: "terminal",
        title: "PERMISSION REQUIRED",
        action: formatSafeWorkspaceCommand(input.action),
        explanation: "The assistant wants to run this read-only terminal command:",
      };
    } catch {
      return {
        kind: "invalid",
        title: "UNRECOGNISED TERMINAL ACTION",
        action: toolName,
        explanation: "The requested terminal action is not on the allowlist.",
      };
    }
  }

  if (toolName.startsWith("airbnb__")) {
    return {
      kind: "external",
      title: "EXTERNAL DATA REQUEST",
      action: toolName,
      explanation:
        "This sends the search details below to the Airbnb MCP server and retrieves public listing data.",
    };
  }

  return null;
}
