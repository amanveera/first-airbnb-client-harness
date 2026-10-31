import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function requireString(value, description) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${description} must be a non-empty string.`);
  }

  return value;
}

function resolveRelativeArgument(argument, configDirectory) {
  if (argument.startsWith("./") || argument.startsWith("../")) {
    return resolve(configDirectory, argument);
  }

  return argument;
}

function readEnvironment(value, serverName) {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Server "${serverName}" env must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, rawValue]) => {
      const envValue = requireString(
        rawValue,
        `Server "${serverName}" env.${key}`
      );
      const reference = envValue.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);

      if (!reference) {
        return [key, envValue];
      }

      const [placeholder, variableName] = reference;
      const valueFromParent = process.env[variableName];

      if (!valueFromParent) {
        throw new Error(
          `Server "${serverName}" needs ${variableName}. Set it in your terminal before starting the client (the config contains ${placeholder}, not the key itself).`
        );
      }

      return [key, valueFromParent];
    })
  );
}

/**
 * Load the familiar mcp_config.json format used by clients such as Claude
 * Desktop. Relative program paths are resolved from the config file itself.
 */
export async function loadMcpServerConfig(configPath) {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read MCP config at ${configPath}: ${error.message}`
    );
  }

  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
    throw new Error('MCP config must contain an "mcpServers" object.');
  }

  const configDirectory = dirname(configPath);
  const servers = [];

  for (const [name, value] of Object.entries(parsed.mcpServers)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Server "${name}" must be an object.`);
    }

    if (value.disabled === true) {
      continue;
    }

    if (value.disabledIfEnvMissing !== undefined) {
      const variableName = requireString(
        value.disabledIfEnvMissing,
        `Server "${name}" disabledIfEnvMissing`
      );

      if (!process.env[variableName]) {
        continue;
      }
    }

    const command = requireString(value.command, `Server "${name}" command`);
    const rawArgs = value.args ?? [];

    if (!Array.isArray(rawArgs) || rawArgs.some((argument) => typeof argument !== "string")) {
      throw new Error(`Server "${name}" args must be an array of strings.`);
    }

    servers.push({
      name,
      command,
      args: rawArgs.map((argument) =>
        resolveRelativeArgument(argument, configDirectory)
      ),
      env: readEnvironment(value.env, name),
    });
  }

  if (servers.length === 0) {
    throw new Error("No enabled MCP servers were found in the config.");
  }

  return servers;
}
