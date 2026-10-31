# Learn the Client Harness

This folder explains the architecture behind this repository in plain language. Read it while opening the matching code files.

## The big idea

An AI client is not only a model chat box. It is a small operating system around a model:

```text
interface + model + tools + safety rules + state + observability
```

The **harness** is the code that coordinates those parts. In this project, `AgentRunner` is the center of the harness.

## 1. The interfaces: CLI and Web UI

Files:

- `cli.js` + `terminal-ui.js`
- `web-server.js` + `web/`

The terminal and browser look different, but they use the same `AgentRunner`. This is a useful design rule:

> Keep the interface separate from the agent logic so you can add a new interface without rewriting the harness.

The CLI reads a line of text. The web app sends a message over HTTP and receives live events. Both pass a user message to `runner.runTurn(...)`.

## 2. The model provider: the brain, not the product

Files:

- `provider-registry.js`
- `scripted-provider.js`
- `openai-provider.js`

The provider answers one question: “given this conversation and these tool definitions, what should happen next?”

It can return either:

```text
final response
```

or:

```text
tool call + JSON arguments
```

The OpenAI provider adapts that contract to the Responses API. The scripted provider lets you learn the flow without paying for a model call.

## 3. AgentRunner: the beginning of the harness

File: `agent-runner.js`

`AgentRunner` owns the loop:

1. Save the user message.
2. Ask the provider what comes next.
3. If the provider returns text, show it to the user.
4. If it returns a tool call, apply safety policy and ask for approval when necessary.
5. Call the tool and save the result.
6. Give the result back to the provider so it can explain what happened.

This is why the model is not the harness. The model chooses an action; the harness decides whether, how, and where that action is allowed to run.

## 4. MCP: a shared language for tools

Files:

- `mcp-tool-manager.js`
- `mcp_config.json`
- `local-tools/time-server.js`

**MCP** means Model Context Protocol. It is a standard way for an AI client to discover tools and call them with structured JSON.

In this project, the client launches a local tool server as a child process over `stdio`. The manager asks each server which tools it offers, names tools by server—for example `learning-tools__get_current_time`—and routes later calls back to the right server.

The Airbnb server is a different MCP server. The harness does not need to know how Airbnb search works; it only needs the tool schema and a safe connection.

## 5. Client versus server

```text
Your client/harness                     MCP server
-------------------                     ----------
shows UI                                exposes tools
calls the model                         performs focused work
asks user for approval                  returns structured results
stores local transcripts                does not control your UI
```

The client is your product. An MCP server is one optional capability connected to it.

## 6. Safety is code, not a prompt

Files:

- `tool-approval-policy.js`
- `local-tools/safe-command-policy.js`
- `local-tools/workspace-files.js`
- `mcp-tool-manager.js`

The model may suggest a tool call, but it does not get direct authority.

| Risk | Harness rule |
| --- | --- |
| Shell commands | Only a fixed read-only allowlist exists. No arbitrary Bash text is executed. |
| External requests | Airbnb search requires explicit approval. |
| File access | Paths outside the repository, symlinks outside it, secret files, and large files are blocked. |
| API keys | Keys come from the Terminal environment, not source files. |
| Third-party MCP processes | They get a minimal environment, so the OpenAI key is not leaked to them. |
| Model output in the web UI | Markdown is rendered with DOM nodes, never model-supplied HTML. |

These controls are not perfect production security. They are concrete examples of where a real harness earns its complexity.

## 7. Approvals: human control at the boundary

Before a read-only terminal command or an external Airbnb request runs, the harness pauses and shows:

- the tool name
- its arguments
- why it needs approval
- approve or reject choices

The model never sees an approval as a tool result until the user has decided. This is a practical “human in the loop” pattern.

## 8. State, transcripts, and tokens

Files:

- `transcript-store.js`
- `token-tracker.js`

The harness keeps its own high-level history of user, assistant, and tool messages. It saves that history as a local JSON transcript when a session ends. Transcripts are ignored by Git because they can contain private work context.

The token tracker uses exact usage returned by a real provider when available; otherwise it displays a local estimate. This makes cost and context size visible instead of mysterious.

## 9. Why external tools can fail even when your harness works

The Airbnb integration demonstrated three separate layers of failure:

1. A website can reject automated access.
2. A replacement API can reject arguments that do not match its schema.
3. A model can select the correct tool but still produce imperfect arguments.

Those failures are valuable lessons. A robust harness surfaces the error, keeps the user in control, adapts known provider quirks in a small documented layer, and never pretends a failed tool call succeeded.

## 10. Suggested experiments

1. Start with the scripted provider and ask for the current time.
2. Switch to OpenAI and watch the model decide when to use a tool.
3. Reject an approval and see how the agent responds.
4. Read `safe-command-policy.js`, then add one harmless read-only command deliberately.
5. Add a new local MCP tool that returns a weather-free fake fact, then discover it in `/tools`.
6. Replace the web UI without touching `AgentRunner`.
7. Add session-resume support by loading a local transcript—only after you understand what conversation state must be restored.

## The practical takeaway

Building your own harness teaches you where trust, state, and safety live. Using an existing mature harness is usually faster for real work. Building a small one is the best way to understand what those mature tools are doing for you.
