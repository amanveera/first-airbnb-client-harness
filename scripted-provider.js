export class ScriptedProvider {
  constructor({ name = "scripted-standard", style = "standard" } = {}) {
    this.name = name;
    this.style = style;
  }

  formatReply(kind, content, toolCount) {
    if (this.style === "brief") {
      if (kind === "time") return `Time: ${content}`;
      if (kind === "workspace") return `Workspace:\n${content}`;
      if (kind === "file") return `File:\n${content}`;
      if (kind === "terminal") return `Terminal:\n${content}`;
      return `Received: "${content}" (${toolCount} tool(s) available).`;
    }

    if (kind === "time") return `The current time is ${content}.`;
    if (kind === "workspace") return `Here is the workspace information:\n${content}`;
    if (kind === "file") return `Here is the file content:\n${content}`;
    if (kind === "terminal") return `Here is the terminal result:\n${content}`;
    return `I received: "${content}". I can see ${toolCount} MCP tool(s).`;
  }

  async generate({ messages, tools }) {
    const latestMessage = messages[messages.length - 1];
    const baseToolName = latestMessage.name?.split("__").at(-1);

    if (latestMessage.role === "tool") {
      if (baseToolName === "get_current_time") {
        return {
          type: "final",
          text: this.formatReply("time", latestMessage.content),
        };
      }

      if (baseToolName === "inspect_workspace") {
        return {
          type: "final",
          text: this.formatReply("workspace", latestMessage.content),
        };
      }

      if (baseToolName === "read_workspace_file") {
        return {
          type: "final",
          text: this.formatReply("file", latestMessage.content),
        };
      }

      if (baseToolName === "run_workspace_command") {
        return {
          type: "final",
          text: latestMessage.content.startsWith("Tool error:")
            ? "The terminal command failed. Its output is shown above."
            : "The approved terminal command completed. Its output is shown above.",
        };
      }

      if (baseToolName === "airbnb_search") {
        return {
          type: "final",
          text: latestMessage.content.includes("denied permission")
            ? "The Airbnb search was not sent because you rejected the external request."
            : "The Airbnb search completed. Its result is shown above.",
        };
      }
    }

    const userText = latestMessage.content.toLowerCase();

    const findTool = (toolName) =>
      tools.find(
        (tool) => tool.name === toolName || tool.name.endsWith(`__${toolName}`)
      );
    const timeTool = findTool("get_current_time");
    const workspaceTool = findTool("inspect_workspace");
    const fileReadTool = findTool("read_workspace_file");
    const terminalTool = findTool("run_workspace_command");
    const airbnbSearchTool = findTool("airbnb_search");

    if (userText.includes("time") && timeTool) {
      return {
        type: "tool_call",
        toolName: timeTool.name,
        input: {},
      };
    }

    if (
      userText.includes("read") &&
      userText.includes("readme") &&
      fileReadTool
    ) {
      return {
        type: "tool_call",
        toolName: fileReadTool.name,
        input: {
          path: "README.md",
        },
      };
    }

    if (userText.includes("airbnb") && airbnbSearchTool) {
      return {
        type: "tool_call",
        toolName: airbnbSearchTool.name,
        // A predictable sample input lets us test the approval UX without an LLM.
        input: { location: "Austin, TX" },
      };
    }

    if (userText.includes("git status") && terminalTool) {
      return {
        type: "tool_call",
        toolName: terminalTool.name,
        input: { action: "git_status" },
      };
    }

    if (
      (userText.includes("run pwd") ||
        (userText.includes("terminal") && userText.includes("directory"))) &&
      terminalTool
    ) {
      return {
        type: "tool_call",
        toolName: terminalTool.name,
        input: { action: "working_directory" },
      };
    }

    if (
      (userText.includes("terminal") && userText.includes("list")) &&
      terminalTool
    ) {
      return {
        type: "tool_call",
        toolName: terminalTool.name,
        input: { action: "list_files" },
      };
    }

    if (
      (userText.includes("recent commits") || userText.includes("git log")) &&
      hasTerminalTool
    ) {
      return {
        type: "tool_call",
        toolName: "run_workspace_command",
        input: { action: "git_recent_commits" },
      };
    }

    if (userText.includes("git diff") && terminalTool) {
      return {
        type: "tool_call",
        toolName: terminalTool.name,
        input: { action: "git_diff_summary" },
      };
    }

    if (
      (userText.includes("file") ||
        userText.includes("folder") ||
        userText.includes("workspace")) &&
      workspaceTool
    ) {
      return {
        type: "tool_call",
        toolName: workspaceTool.name,
        input: {
          action: "list_files",
        },
      };
    }

    return {
      type: "final",
      text: this.formatReply("message", latestMessage.content, tools.length),
    };
  }
}
