import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { AgentRunner } from "./agent-runner.js";
import { McpToolManager } from "./mcp-tool-manager.js";
import { loadMcpServerConfig } from "./mcp-config.js";
import { createProvider, listProviderModels } from "./provider-registry.js";
import { TranscriptStore } from "./transcript-store.js";

const projectDirectory = fileURLToPath(new URL("./", import.meta.url));
const webDirectory = resolve(projectDirectory, "web");
const mcpConfigPath = resolve(projectDirectory, "mcp_config.json");
const transcriptDirectory = resolve(projectDirectory, "transcripts");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 3030);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

let provider = createProvider("scripted-standard");
let toolManager;
let runner;
let pendingApproval;
let turnActive = false;
let shuttingDown = false;
const eventClients = new Set();
const transcriptStore = new TranscriptStore(transcriptDirectory);

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function broadcast(type, data = {}) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of eventClients) {
    client.write(payload);
  }
}

function getPublicStatus() {
  return {
    model: {
      id: provider.modelId,
      name: provider.name,
    },
    models: listProviderModels(),
    servers: toolManager.listServers(),
    tools: null,
    tokenStatus: runner.getTokenStatus(),
    turnActive,
    waitingForApproval: Boolean(pendingApproval),
  };
}

async function getStatusWithTools() {
  return {
    ...getPublicStatus(),
    tools: await runner.getAvailableTools(),
  };
}

async function readJson(request) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > 32_000) {
      throw new Error("Request body is too large.");
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function requireIdleTurn() {
  if (turnActive || pendingApproval) {
    throw new Error("A tool request or assistant response is already in progress.");
  }
}

async function requestToolApproval({ toolName, input, approvalRequest }) {
  if (approvalRequest.kind === "invalid") {
    broadcast("approval_rejected", {
      toolName,
      input,
      reason: approvalRequest.explanation,
    });
    return false;
  }

  if (pendingApproval) {
    throw new Error("Only one tool approval can be pending at a time.");
  }

  const id = randomUUID();
  broadcast("approval_required", {
    id,
    toolName,
    input,
    approvalRequest,
  });

  return new Promise((resolveApproval) => {
    pendingApproval = { id, resolveApproval };
  });
}

async function handleAgentEvent(event) {
  // The browser receives the same harness events that the terminal UI receives.
  broadcast(event.type, event);
}

async function saveTranscript() {
  if (!runner || runner.getHistory().length === 0) {
    return null;
  }

  return transcriptStore.save({
    messages: runner.getHistory(),
    providerName: provider.name,
    tools: await runner.getAvailableTools(),
    tokenStatus: runner.getTokenStatus(),
  });
}

async function startTurn(message) {
  turnActive = true;
  broadcast("turn_started", { message });

  try {
    const text = await runner.runTurn(message);
    broadcast("assistant", {
      text,
      tokenStatus: runner.getTokenStatus(),
    });
  } catch (error) {
    broadcast("error", { message: error.message });
  } finally {
    turnActive = false;
    broadcast("turn_finished", {
      tokenStatus: runner.getTokenStatus(),
    });
  }
}

async function serveStatic(requestUrl, response) {
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const requestedFile = resolve(webDirectory, `.${pathname}`);

  if (requestedFile !== webDirectory && !requestedFile.startsWith(`${webDirectory}${sep}`)) {
    sendError(response, 403, "That file path is not allowed.");
    return;
  }

  try {
    const content = await readFile(requestedFile);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(requestedFile)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "Page not found.");
      return;
    }

    throw error;
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/api/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });
      response.write(": connected\n\n");
      eventClients.add(response);
      request.on("close", () => eventClients.delete(response));
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/status") {
      sendJson(response, 200, await getStatusWithTools());
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/chat") {
      requireIdleTurn();
      const body = await readJson(request);
      const message = typeof body.message === "string" ? body.message.trim() : "";

      if (message === "") {
        sendError(response, 400, "A message is required.");
        return;
      }

      if (message.length > 8_000) {
        sendError(response, 400, "Messages must be 8,000 characters or fewer.");
        return;
      }

      // The response is asynchronous because a tool can pause for user consent.
      void startTurn(message);
      sendJson(response, 202, { accepted: true });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/approval") {
      const body = await readJson(request);

      if (!pendingApproval || body.id !== pendingApproval.id) {
        sendError(response, 404, "That approval request is no longer pending.");
        return;
      }

      const approved = body.approved === true;
      const approval = pendingApproval;
      pendingApproval = undefined;
      broadcast("approval_resolved", { id: approval.id, approved });
      approval.resolveApproval(approved);
      sendJson(response, 200, { approved });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/model") {
      requireIdleTurn();
      const body = await readJson(request);

      try {
        const nextProvider = createProvider(body.modelId);
        runner.clear();
        provider = nextProvider;
        runner.setProvider(nextProvider);
        broadcast("model_changed", {
          model: { id: provider.modelId, name: provider.name },
        });
        sendJson(response, 200, await getStatusWithTools());
      } catch (error) {
        sendError(response, 400, error.message);
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/clear") {
      requireIdleTurn();
      runner.clear();
      broadcast("conversation_cleared");
      sendJson(response, 200, getPublicStatus());
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/transcript") {
      requireIdleTurn();
      const transcriptPath = await saveTranscript();
      broadcast("transcript_saved", { transcriptPath });
      sendJson(response, 200, { transcriptPath });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    await serveStatic(requestUrl, response);
  } catch (error) {
    sendError(response, 500, error.message);
  }
});

async function start() {
  const serverConfigs = await loadMcpServerConfig(mcpConfigPath);
  toolManager = new McpToolManager(serverConfigs);
  await toolManager.connect();
  runner = new AgentRunner(provider, toolManager, {
    requestApproval: requestToolApproval,
    onEvent: handleAgentEvent,
  });

  server.listen(port, host, () => {
    console.log(`Aldrin Client Web UI is running at http://${host}:${port}`);
    console.log("Press Ctrl-C to save the transcript and stop the server.");
  });
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  pendingApproval?.resolveApproval(false);
  pendingApproval = undefined;

  try {
    const transcriptPath = await saveTranscript();
    if (transcriptPath) {
      console.log(`Transcript saved: ${transcriptPath}`);
    }
  } catch (error) {
    console.error(`Transcript save failed: ${error.message}`);
  }

  await toolManager?.close();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

start().catch((error) => {
  console.error(`Web UI could not start: ${error.message}`);
  process.exit(1);
});
