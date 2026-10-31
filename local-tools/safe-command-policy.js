import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// This is intentionally an allowlist, not a "run any Bash command" tool.
// execFile also means user/model input is never interpreted by a shell.
export const safeWorkspaceCommands = {
  working_directory: {
    label: "Show the working directory",
    command: "pwd",
    args: [],
  },
  list_files: {
    label: "List workspace files",
    command: "ls",
    args: ["-la"],
  },
  git_status: {
    label: "Show Git working-tree status",
    command: "git",
    args: ["status", "--short"],
  },
  git_diff_summary: {
    label: "Show a summary of uncommitted Git changes",
    command: "git",
    args: ["diff", "--stat"],
  },
  git_recent_commits: {
    label: "Show the five most recent Git commits",
    command: "git",
    args: ["log", "--oneline", "-5"],
  },
};

export function getSafeWorkspaceCommand(action) {
  const command = safeWorkspaceCommands[action];

  if (!command) {
    throw new Error(`Unknown safe command action: ${action}`);
  }

  return command;
}

export function formatSafeWorkspaceCommand(action) {
  const { command, args } = getSafeWorkspaceCommand(action);
  return [command, ...args].join(" ");
}

function errorText(error) {
  const commandOutput = [error.stdout, error.stderr]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim());

  if (commandOutput.length > 0) {
    return [...new Set(commandOutput)].join("\n");
  }

  return error.message || "The command failed without output.";
}

/** Run exactly one fixed, read-only command in the chosen workspace. */
export async function runSafeWorkspaceCommand(workspaceRoot, action) {
  const selectedCommand = getSafeWorkspaceCommand(action);

  try {
    const { stdout, stderr } = await execFileAsync(
      selectedCommand.command,
      selectedCommand.args,
      {
        cwd: workspaceRoot,
        timeout: 5_000,
        maxBuffer: 10_000,
      }
    );

    const output = [stdout, stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      isError: false,
      text: output || "(No output.)",
    };
  } catch (error) {
    return {
      isError: true,
      text: errorText(error),
    };
  }
}
