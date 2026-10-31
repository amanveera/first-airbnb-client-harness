import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

function createSessionId(savedAt) {
  return `session-${savedAt.replace(/[:.]/g, "-")}`;
}

/** Save a completed chat session as a JSON file that can be restored later. */
export class TranscriptStore {
  constructor(directory) {
    this.directory = directory;
  }

  async save({ messages, providerName, tools, tokenStatus }) {
    if (messages.length === 0) {
      return null;
    }

    const savedAt = new Date().toISOString();
    const sessionId = createSessionId(savedAt);
    const transcript = {
      version: 1,
      sessionId,
      savedAt,
      provider: providerName,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
      tokenUsage: tokenStatus,
      messages,
    };

    await mkdir(this.directory, { recursive: true });

    const filePath = join(this.directory, `${sessionId}.json`);
    const temporaryPath = `${filePath}.tmp`;

    // Write then rename so an interrupted save does not leave a half-written
    // transcript under a normal session filename.
    await writeFile(temporaryPath, `${JSON.stringify(transcript, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);

    return filePath;
  }
}
