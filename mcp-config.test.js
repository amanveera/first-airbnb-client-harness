import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadMcpServerConfig } from "./mcp-config.js";

const configPath = fileURLToPath(new URL("./mcp_config.json", import.meta.url));

test("loads the Airbnb MCP key from the terminal environment, not the config", async () => {
  const originalKey = process.env.HASDATA_API_KEY;
  process.env.HASDATA_API_KEY = "test-key-not-a-real-secret";

  try {
    const servers = await loadMcpServerConfig(configPath);
    const airbnb = servers.find((server) => server.name === "airbnb");

    assert.deepEqual(airbnb.args, ["-y", "@hasdata/airbnb-mcp"]);
    assert.equal(airbnb.env.HASDATA_API_KEY, "test-key-not-a-real-secret");
    assert.notEqual(
      airbnb.env.HASDATA_API_KEY,
      "${HASDATA_API_KEY}"
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.HASDATA_API_KEY;
    } else {
      process.env.HASDATA_API_KEY = originalKey;
    }
  }
});

test("keeps the optional Airbnb MCP disabled when its key is absent", async () => {
  const originalKey = process.env.HASDATA_API_KEY;
  delete process.env.HASDATA_API_KEY;

  try {
    const servers = await loadMcpServerConfig(configPath);
    assert.deepEqual(servers.map((server) => server.name), ["learning-tools"]);
  } finally {
    if (originalKey !== undefined) {
      process.env.HASDATA_API_KEY = originalKey;
    }
  }
});
