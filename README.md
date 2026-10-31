# First Airbnb Client Harness

An educational AI client harness built from scratch with JavaScript. It has a terminal CLI and a local web UI, connects models to tools through MCP, asks for approval before sensitive actions, and includes an optional Airbnb listing search integration.

The goal is not to replace a mature agent product. The goal is to make the moving parts visible enough to learn how products such as coding agents are assembled.

> The Airbnb integration is a read-only demonstration. It does not book anything, and listing data can change at any time.

## What you can learn

- How a CLI or web page becomes an AI client
- How an `AgentRunner` coordinates the model-and-tool loop
- How MCP connects a client to local and remote tools
- Why a harness—not the model—owns approvals and safety rules
- How to keep API keys out of code and out of child tool processes
- How to count tokens, save transcripts, and render model Markdown safely

Read [learning/README.md](learning/README.md) for the guided architecture walkthrough, [WORKFLOW.md](WORKFLOW.md) for the end-to-end flow chart, and [guides/USING_YOUR_OWN_KEYS.md](guides/USING_YOUR_OWN_KEYS.md) to understand API keys, tokens, and personal API billing.

## Architecture

```text
CLI or Web UI → AgentRunner → Model provider → AgentRunner → MCP tools
                         ↘ approval gate ↗
```

The more complete diagram is in [WORKFLOW.md](WORKFLOW.md).

## Quick start

Requirements: Node.js 22 or newer.

```bash
npm install
npm test
```

Start the terminal client:

```bash
npm run cli
```

Start the browser client:

```bash
npm run web
```

Then open `http://127.0.0.1:3030`.

Without any keys, the scripted practice provider and safe local MCP tools still work. Select the OpenAI provider only after setting your own key in the same Terminal session:

```bash
read -s "OPENAI_API_KEY?Paste your OpenAI API key: "
export OPENAI_API_KEY
```

Every person who runs the real OpenAI model must provide their own key. Their API usage is charged to their own API account/project, not to the repository author. See [Use Your Own API Keys and Pay for Your Own Usage](guides/USING_YOUR_OWN_KEYS.md) for the explanation and security checklist.

## Optional Airbnb MCP

The project uses a hosted HasData Airbnb MCP integration when `HASDATA_API_KEY` is set. It is intentionally disabled when that key is absent, so a new clone can run without it.

```bash
read -s "HASDATA_API_KEY?Paste your HasData API key: "
export HASDATA_API_KEY
npm run web
```

The key stays in your Terminal environment. Do not put it in `.env.example`, `mcp_config.json`, Git commits, issues, or chat messages.

## Safety choices in this project

- Local terminal access is an allowlist of fixed read-only commands.
- The user must approve terminal and external Airbnb requests.
- File reads are confined to this repository, block `.env` files, resolve symlinks safely, and cap file size.
- MCP child processes receive a minimal environment. The OpenAI key is not passed to third-party MCP servers.
- The web UI renders model Markdown with safe DOM elements rather than injecting model HTML.
- Transcripts are saved locally and ignored by Git.

## Project map

| Path | Purpose |
| --- | --- |
| `cli.js` | Terminal interface |
| `web-server.js` and `web/` | Local browser interface |
| `agent-runner.js` | The model → tool → result loop |
| `openai-provider.js` | OpenAI Responses API adapter |
| `mcp-tool-manager.js` | Starts and routes MCP tool servers |
| `local-tools/` | Safe local MCP server and safety policies |
| `mcp_config.json` | Enabled MCP tool-server configuration |
| `learning/` | Guided architecture notes |
| `*.test.js` | Small tests for safety and integration behavior |

## Important limitations

This is a learning project, not a production security boundary. Do not expose it to the public internet, do not add arbitrary shell execution, and review any third-party MCP server before adding it. External tools can fail, change their schemas, consume credits, or return incomplete data.
