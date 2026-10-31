import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const MAX_FILE_BYTES = 50_000;

function isOutsideWorkspace(workspaceRoot, filePath) {
  const pathInsideWorkspace = relative(workspaceRoot, filePath);

  return (
    pathInsideWorkspace === "" ||
    pathInsideWorkspace === ".." ||
    pathInsideWorkspace.startsWith(`..${sep}`) ||
    isAbsolute(pathInsideWorkspace)
  );
}

function isSecretPath(relativePath) {
  return relativePath.split(sep).some(
    (pathPart) => pathPart === ".env" || pathPart.startsWith(".env.")
  );
}

/**
 * Read a small UTF-8 text file without ever leaving the chosen workspace.
 * Checking both the requested and resolved paths prevents path traversal and
 * symlinks that point outside the workspace.
 */
export async function readWorkspaceFile(workspaceRoot, requestedPath) {
  const candidatePath = resolve(workspaceRoot, requestedPath);

  if (isOutsideWorkspace(workspaceRoot, candidatePath)) {
    throw new Error("That path is outside the allowed workspace.");
  }

  const realWorkspaceRoot = await realpath(workspaceRoot);
  const realFilePath = await realpath(candidatePath);

  if (isOutsideWorkspace(realWorkspaceRoot, realFilePath)) {
    throw new Error("That path resolves outside the allowed workspace.");
  }

  const relativePath = relative(realWorkspaceRoot, realFilePath);

  if (isSecretPath(relativePath)) {
    throw new Error(".env files are blocked to protect secrets.");
  }

  const fileInfo = await stat(realFilePath);

  if (!fileInfo.isFile()) {
    throw new Error("That path is not a regular file.");
  }

  if (fileInfo.size > MAX_FILE_BYTES) {
    throw new Error("That file is too large to read safely.");
  }

  return readFile(realFilePath, "utf8");
}
