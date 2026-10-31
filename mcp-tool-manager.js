
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const TOOL_SEPARATOR = "__";

function createChildEnvironment(customEnvironment = {}) {
  // Never pass the whole parent environment to an MCP process. In particular,
  // this prevents a third-party tool server from receiving OPENAI_API_KEY.
  const safeVariableNames =
    process.platform === "win32"
      ? [
          "APPDATA",
          "HOMEDRIVE",
          "HOMEPATH",
          "LOCALAPPDATA",
          "PATH",
          "SYSTEMDRIVE",
          "SYSTEMROOT",
          "TEMP",
          "TMP",
          "USERPROFILE",
        ]
      : ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "TMPDIR", "USER"];

  const environment = {};

  for (const name of safeVariableNames) {
    if (process.env[name]) {
      environment[name] = process.env[name];
    }
  }

  return { ...environment, ...customEnvironment };
}

function normaliseServerConfigs(serverConfigs) {
  // Backward-compatible shortcut for the earlier one-server lessons.
  if (typeof serverConfigs === "string") {
    return [
      {
        name: "learning-tools",
        command: process.execPath,
        args: [serverConfigs],
      },
    ];
  }

  if (!Array.isArray(serverConfigs) || serverConfigs.length === 0) {
    throw new Error("At least one MCP server configuration is required.");
  }

  return serverConfigs;
}

export function qualifyToolName(serverName, toolName) {
  return `${serverName}${TOOL_SEPARATOR}${toolName}`;
}

export class McpToolManager {
  constructor(serverConfigs) {
    this.serverConfigs = normaliseServerConfigs(serverConfigs);
    this.clients = new Map();
  }

  async connect() {
    try {
      for (const server of this.serverConfigs) {
        const client = new Client({
          name: `learning-client-cli-${server.name}`,
          version: "1.0.0",
        });

        const transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: createChildEnvironment(server.env),
          // Tool servers often write diagnostic logs to stderr. Keeping that
          // separate prevents a server from breaking the CLI's visual layout.
          stderr: "ignore",
        });

        await client.connect(transport);
        this.clients.set(server.name, client);
      }
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async listTools() {
    const toolLists = await Promise.all(
      [...this.clients.entries()].map(async ([serverName, client]) => {
        const result = await client.listTools();

        return result.tools.map((tool) => ({
          ...tool,
          name: qualifyToolName(serverName, tool.name),
          description: `[${serverName}] ${tool.description}`,
        }));
      })
    );

    return toolLists.flat();
  }

  async callTool(name, argumentsForTool = {}) {
    const separatorIndex = name.indexOf(TOOL_SEPARATOR);
    let serverName;
    let toolName;

    if (separatorIndex === -1 && this.clients.size === 1) {
      [[serverName]] = this.clients;
      toolName = name;
    } else if (separatorIndex > 0) {
      serverName = name.slice(0, separatorIndex);
      toolName = name.slice(separatorIndex + TOOL_SEPARATOR.length);
    } else {
      throw new Error(
        `Tool "${name}" is not qualified with a server name. Use /tools to inspect available tools.`
      );
    }

    const client = this.clients.get(serverName);

    if (!client) {
      throw new Error(`No connected MCP server named "${serverName}".`);
    }

    return client.callTool({
      name: toolName,
      arguments: argumentsForTool,
    });
  }

  listServers() {
    return this.serverConfigs.map(({ name, command, args }) => ({
      name,
      command,
      args,
      connected: this.clients.has(name),
    }));
  }

  async close() {
    for (const client of this.clients.values()) {
      await client.close();
    }

    this.clients.clear();
  }
}
