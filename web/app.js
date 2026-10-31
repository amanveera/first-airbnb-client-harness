const conversation = document.querySelector("#conversation");
const emptyState = document.querySelector("#empty-state");
const composer = document.querySelector("#composer");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const activity = document.querySelector("#activity");
const modelSelect = document.querySelector("#model-select");
const modelNote = document.querySelector("#model-note");
const toolList = document.querySelector("#tool-list");
const toolCount = document.querySelector("#tool-count");
const connectionStatus = document.querySelector("#connection-status");
const clearButton = document.querySelector("#clear-button");
const saveButton = document.querySelector("#save-button");
const tokenTotal = document.querySelector("#token-total");
const tokenDetail = document.querySelector("#token-detail");
const tokenMethod = document.querySelector("#token-method");
const messageTemplate = document.querySelector("#message-template");

let isBusy = false;
let pendingApprovalId;

function setActivity(text = "", busy = false) {
  activity.textContent = text;
  activity.classList.toggle("busy", busy);
}

function setBusy(nextBusy) {
  isBusy = nextBusy;
  messageInput.disabled = nextBusy;
  sendButton.disabled = nextBusy;
  modelSelect.disabled = nextBusy;
  clearButton.disabled = nextBusy;
  saveButton.disabled = nextBusy;
}

function scrollToNewest() {
  conversation.scrollTop = conversation.scrollHeight;
}

function isSafeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function appendInlineMarkdown(target, text) {
  // Build elements instead of using innerHTML. Model output is content, never
  // trusted browser code.
  const pattern = /(\[([^\]]+)\]\(([^\s)]+)\)|(\*\*([^*]+)\*\*)|`([^`]+)`)/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) {
      target.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    if (match[2] && isSafeLink(match[3])) {
      const link = document.createElement("a");
      link.href = match[3];
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = match[2];
      target.append(link);
    } else if (match[5]) {
      const strong = document.createElement("strong");
      strong.textContent = match[5];
      target.append(strong);
    } else if (match[6]) {
      const code = document.createElement("code");
      code.textContent = match[6];
      target.append(code);
    } else {
      target.append(document.createTextNode(match[0]));
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    target.append(document.createTextNode(text.slice(cursor)));
  }
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
    line
  );
}

function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(target, lines) {
  const wrapper = document.createElement("div");
  wrapper.className = "markdown-table-wrap";
  const table = document.createElement("table");
  const header = tableCells(lines[0]);
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const label of header) {
    const cell = document.createElement("th");
    appendInlineMarkdown(cell, label);
    headerRow.append(cell);
  }

  head.append(headerRow);
  table.append(head);

  const body = document.createElement("tbody");
  for (const row of lines.slice(2)) {
    const rowElement = document.createElement("tr");
    for (const value of tableCells(row)) {
      const cell = document.createElement("td");
      appendInlineMarkdown(cell, value);
      rowElement.append(cell);
    }
    body.append(rowElement);
  }

  table.append(body);
  wrapper.append(table);
  target.append(wrapper);
}

function renderMarkdown(target, markdown) {
  target.replaceChildren();
  const lines = String(markdown ?? "").replaceAll("\r", "").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.append(code);
      target.append(pre);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length + 2}`);
      appendInlineMarkdown(element, heading[2]);
      target.append(element);
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") {
        tableLines.push(lines[index]);
        index += 1;
      }
      renderTable(target, tableLines);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const list = document.createElement(unordered ? "ul" : "ol");
      while (index < lines.length) {
        const item = lines[index].match(unordered ? /^\s*[-*]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/);
        if (!item) break;
        const listItem = document.createElement("li");
        appendInlineMarkdown(listItem, item[1]);
        list.append(listItem);
        index += 1;
      }
      target.append(list);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() !== "") {
      if (
        paragraphLines.length > 0 &&
        (lines[index].startsWith("```") ||
          (lines[index].includes("|") && isTableDivider(lines[index + 1] || "")) ||
          /^\s*[-*]\s+/.test(lines[index]) ||
          /^\s*\d+\.\s+/.test(lines[index]))
      ) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }

    const paragraph = document.createElement("p");
    paragraphLines.forEach((paragraphLine, lineIndex) => {
      if (lineIndex > 0) paragraph.append(document.createElement("br"));
      appendInlineMarkdown(paragraph, paragraphLine);
    });
    target.append(paragraph);
  }
}

function addMessage(role, text) {
  emptyState?.remove();
  const message = messageTemplate.content.firstElementChild.cloneNode(true);
  message.classList.add(role);
  message.querySelector(".message-role").textContent = role === "user" ? "You" : role === "tool" ? "Tool result" : role;
  const content = message.querySelector(".message-content");

  if (role === "assistant") {
    renderMarkdown(content, text);
  } else {
    content.textContent = text;
  }

  conversation.append(message);
  scrollToNewest();
  return message;
}

function addToolEvent(title, input, text, isError = false) {
  const details = [title];
  if (input) details.push(JSON.stringify(input, null, 2));
  if (text) details.push(text);
  return addMessage(isError ? "error" : "tool", details.join("\n\n"));
}

function showApproval({ id, toolName, input, approvalRequest }) {
  pendingApprovalId = id;
  const card = document.createElement("article");
  card.className = "approval-card";
  const heading = document.createElement("h3");
  heading.textContent = approvalRequest.title;
  const explanation = document.createElement("p");
  explanation.textContent = approvalRequest.explanation;
  const details = document.createElement("pre");
  details.textContent = `${toolName}\n${JSON.stringify(input, null, 2)}`;
  const actions = document.createElement("div");
  actions.className = "approval-actions";
  const approve = document.createElement("button");
  approve.className = "approve";
  approve.textContent = approvalRequest.kind === "external" ? "Send request" : "Run command";
  const deny = document.createElement("button");
  deny.className = "deny";
  deny.textContent = "Reject";

  for (const [button, approved] of [[approve, true], [deny, false]]) {
    button.addEventListener("click", async () => {
      approve.disabled = true;
      deny.disabled = true;
      try {
        await postJson("/api/approval", { id, approved });
      } catch (error) {
        showError(error.message);
        approve.disabled = false;
        deny.disabled = false;
      }
    });
  }

  actions.append(approve, deny);
  card.append(heading, explanation, details, actions);
  conversation.append(card);
  scrollToNewest();
  return card;
}

function showError(message) {
  addMessage("error", message);
  setActivity("");
}

function setConnection(online) {
  connectionStatus.classList.toggle("online", online);
  connectionStatus.lastChild.textContent = online ? " Connected locally" : " Connecting locally";
}

function updateTokenStatus(status) {
  if (!status) return;
  const session = status.session;
  tokenTotal.textContent = session.totalTokens.toLocaleString();
  tokenDetail.textContent = `${session.inputTokens.toLocaleString()} input · ${session.outputTokens.toLocaleString()} output`;
  tokenMethod.textContent = status.method.startsWith("provider") ? "API" : "LOCAL";
}

function updateStatus(status) {
  updateTokenStatus(status.tokenStatus);
  if (status.tools) {
    toolCount.textContent = status.tools.length;
    toolList.replaceChildren();
    for (const tool of status.tools) {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = tool.name;
      const description = document.createElement("span");
      description.textContent = tool.description;
      item.append(name, description);
      toolList.append(item);
    }
  }

  if (status.models) {
    modelSelect.replaceChildren();
    for (const model of status.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label;
      option.selected = model.id === status.model.id;
      modelSelect.append(option);
    }
  }

  if (status.model) {
    modelSelect.value = status.model.id;
    const selected = status.models?.find((model) => model.id === status.model.id);
    modelNote.textContent = selected?.description || status.model.name;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

function postJson(url, body) {
  return requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function autoGrow() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message || isBusy) return;

  addMessage("user", message);
  messageInput.value = "";
  autoGrow();
  setBusy(true);
  setActivity("Thinking…", true);

  try {
    await postJson("/api/chat", { message });
  } catch (error) {
    showError(error.message);
    setBusy(false);
  }
});

messageInput.addEventListener("input", autoGrow);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.prompt;
    autoGrow();
    messageInput.focus();
  });
});

modelSelect.addEventListener("change", async () => {
  try {
    setBusy(true);
    const status = await postJson("/api/model", { modelId: modelSelect.value });
    conversation.replaceChildren();
    addMessage("assistant", `Model changed to ${status.model.name}. Conversation cleared.`);
    updateStatus(status);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
});

clearButton.addEventListener("click", async () => {
  try {
    setBusy(true);
    const status = await postJson("/api/clear", {});
    conversation.replaceChildren();
    updateStatus(status);
    setActivity("Conversation cleared.");
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
});

saveButton.addEventListener("click", async () => {
  try {
    saveButton.disabled = true;
    const result = await postJson("/api/transcript", {});
    setActivity(result.transcriptPath ? `Transcript saved: ${result.transcriptPath}` : "Nothing to save yet.");
  } catch (error) {
    showError(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

const events = new EventSource("/api/events");
events.onopen = () => setConnection(true);
events.onerror = () => setConnection(false);
events.addEventListener("thinking", () => setActivity("Thinking…", true));
events.addEventListener("tool_input_normalized", ({ data }) => {
  const event = JSON.parse(data);
  addToolEvent(
    `COMPATIBILITY ADJUSTMENT · ${event.toolName}`,
    null,
    `Omitted zero-value optional fields for this provider: ${event.removedFields.join(", ")}.`
  );
});
events.addEventListener("tool_started", ({ data }) => {
  const event = JSON.parse(data);
  setActivity(`Running ${event.toolName}…`, true);
  addToolEvent(`TOOL · ${event.toolName}`, event.input);
});
events.addEventListener("tool_result", ({ data }) => {
  const event = JSON.parse(data);
  addToolEvent(`TOOL RESULT · ${event.toolName}`, null, event.text, event.isError);
});
events.addEventListener("approval_required", ({ data }) => {
  setActivity("Waiting for your approval.");
  showApproval(JSON.parse(data));
});
events.addEventListener("approval_resolved", ({ data }) => {
  const { id, approved } = JSON.parse(data);
  if (id !== pendingApprovalId) return;
  pendingApprovalId = undefined;
  setActivity(approved ? "Approved — running tool…" : "Rejected — informing the model…", true);
});
events.addEventListener("assistant", ({ data }) => {
  const event = JSON.parse(data);
  addMessage("assistant", event.text);
  updateTokenStatus(event.tokenStatus);
});
events.addEventListener("error", ({ data }) => showError(JSON.parse(data).message));
events.addEventListener("turn_finished", ({ data }) => {
  updateTokenStatus(JSON.parse(data).tokenStatus);
  setActivity("");
  setBusy(false);
  messageInput.focus();
});
events.addEventListener("model_changed", ({ data }) => {
  const { model } = JSON.parse(data);
  modelSelect.value = model.id;
});
events.addEventListener("transcript_saved", ({ data }) => {
  const { transcriptPath } = JSON.parse(data);
  if (transcriptPath) setActivity(`Transcript saved: ${transcriptPath}`);
});

try {
  updateStatus(await requestJson("/api/status"));
  setConnection(true);
  messageInput.focus();
} catch (error) {
  showError(`Could not connect to the local server: ${error.message}`);
}
