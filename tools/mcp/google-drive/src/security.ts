import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

function normalizeRoots(value: string | undefined, fallback: string[]): string[] {
  const roots = (value || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(process.cwd(), entry));

  return roots.length > 0 ? roots : fallback.map((entry) => path.resolve(process.cwd(), entry));
}

export function allowedUploadRoots(): string[] {
  return normalizeRoots(process.env.DRIVE_MCP_ALLOWED_UPLOAD_ROOTS, [
    "data/outbox",
    "data/cas_storage",
  ]);
}

export function downloadRoot(): string {
  const configured = process.env.DRIVE_MCP_DOWNLOAD_ROOT || "data/drive-mcp-downloads";
  const root = path.resolve(process.cwd(), configured);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function isWithin(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function realPathOrResolved(target: string): string {
  if (fs.existsSync(target)) {
    return fs.realpathSync(target);
  }

  const parent = path.dirname(target);
  const realParent = fs.existsSync(parent) ? fs.realpathSync(parent) : realPathOrResolved(parent);
  return path.join(realParent, path.basename(target));
}

export function assertAllowedUploadPath(candidate: string): string {
  const resolved = path.resolve(process.cwd(), candidate);
  const real = realPathOrResolved(resolved);
  const roots = allowedUploadRoots();

  if (!roots.some((root) => isWithin(real, realPathOrResolved(root)))) {
    throw new Error(
      "Filesystem policy rejected upload path. " +
      "Set DRIVE_MCP_ALLOWED_UPLOAD_ROOTS to an explicit allowlist."
    );
  }

  if (!fs.existsSync(real) || !fs.statSync(real).isFile()) {
    throw new Error(`Upload source is not a regular file: ${resolved}`);
  }

  const maxBytes = Number(process.env.DRIVE_MCP_MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES);
  const size = fs.statSync(real).size;
  if (Number.isFinite(maxBytes) && size > maxBytes) {
    throw new Error(`Upload exceeds DRIVE_MCP_MAX_UPLOAD_BYTES (${maxBytes} bytes).`);
  }

  return real;
}

export function assertAllowedDownloadPath(candidate?: string): string {
  const root = downloadRoot();
  const relative = candidate?.trim() || "download.bin";
  const resolved = path.resolve(root, relative);
  const realParent = realPathOrResolved(path.dirname(resolved));

  if (!isWithin(realParent, realPathOrResolved(root))) {
    throw new Error("Filesystem policy rejected download path.");
  }

  if (path.basename(resolved) === "." || path.basename(resolved) === "..") {
    throw new Error("Invalid download filename.");
  }

  fs.mkdirSync(realParent, { recursive: true });
  return resolved;
}
