import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { fileURLToPath } from "node:url";
import { readWorkspaceFile } from "./workspace-files.js";
import {
  runSafeWorkspaceCommand,
  safeWorkspaceCommands,
} from "./safe-command-policy.js";

// The public repository itself is the maximum directory this server can read.
const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

serveStdio(() => {
  const server = new McpServer({
    name: "learning-tools-server",
    version: "1.0.0",
  });

  server.registerTool(
    "get_current_time",
    {
      description: "Gets the current date and time from this computer.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: "text", text: new Date().toLocaleString() }],
    })
  );

  server.registerTool(
    "inspect_workspace",
    {
      description:
        "Safely inspect the project workspace. It can show the workspace location or list its files.",
      inputSchema: z.object({
        action: z.enum(["working_directory", "list_files"]),
      }),
    },
    async ({ action }) => {
      const result = await runSafeWorkspaceCommand(workspaceRoot, action);
      return { content: [{ type: "text", text: result.text }], isError: result.isError };
    }
  );

  server.registerTool(
    "run_workspace_command",
    {
      description:
        "Runs one approved read-only terminal command in this project. The client asks the user for approval before it runs. Available actions: working_directory, list_files, git_status, git_diff_summary, git_recent_commits.",
      inputSchema: z.object({ action: z.enum(Object.keys(safeWorkspaceCommands)) }),
    },
    async ({ action }) => {
      const result = await runSafeWorkspaceCommand(workspaceRoot, action);
      return { content: [{ type: "text", text: result.text }], isError: result.isError };
    }
  );

  server.registerTool(
    "read_workspace_file",
    {
      description:
        "Reads a small text file inside the allowed project workspace. .env files and paths outside the workspace are blocked.",
      inputSchema: z.object({ path: z.string().min(1).max(300) }),
    },
    async ({ path }) => {
      try {
        const text = await readWorkspaceFile(workspaceRoot, path);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    }
  );

  return server;
});
