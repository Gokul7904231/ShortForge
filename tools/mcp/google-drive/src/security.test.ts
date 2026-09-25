import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  allowedUploadRoots,
  assertAllowedDownloadPath,
  assertAllowedUploadPath,
} from "./security.js";

const originalCwd = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(originalCwd, "data-mcp-test-"));
const uploadRoot = path.join(tempRoot, "uploads");
const outsideRoot = path.join(tempRoot, "outside");
fs.mkdirSync(uploadRoot, { recursive: true });
fs.mkdirSync(outsideRoot, { recursive: true });

const validFile = path.join(uploadRoot, "ok.txt");
const outsideFile = path.join(outsideRoot, "secret.txt");
fs.writeFileSync(validFile, "ok");
fs.writeFileSync(outsideFile, "secret");

process.env.DRIVE_MCP_ALLOWED_UPLOAD_ROOTS = uploadRoot;
process.env.DRIVE_MCP_DOWNLOAD_ROOT = path.join(tempRoot, "downloads");
process.env.DRIVE_MCP_MAX_UPLOAD_BYTES = "1024";

try {
  assert.equal(allowedUploadRoots().length, 1);
  assert.equal(assertAllowedUploadPath(validFile), fs.realpathSync(validFile));

  assert.throws(
    () => assertAllowedUploadPath(path.relative(originalCwd, outsideFile)),
    /Filesystem policy rejected upload path/
  );

  assert.throws(
    () => assertAllowedDownloadPath("../../escape.bin"),
    /Filesystem policy rejected download path/
  );

  process.env.DRIVE_MCP_MAX_UPLOAD_BYTES = "1";
  assert.throws(
    () => assertAllowedUploadPath(validFile),
    /exceeds DRIVE_MCP_MAX_UPLOAD_BYTES/
  );

  process.env.DRIVE_MCP_MAX_UPLOAD_BYTES = "1024";
  const symlinkPath = path.join(uploadRoot, "escape-link.txt");
  try {
    fs.symlinkSync(outsideFile, symlinkPath);
    assert.throws(
      () => assertAllowedUploadPath(symlinkPath),
      /Filesystem policy rejected upload path/
    );
  } catch (error) {
    // Symlink creation can be unavailable on some Windows environments.
    if ((error as NodeJS.ErrnoException).code !== "EPERM") {
      throw error;
    }
  }

  console.log("Google Drive MCP security self-test: PASS");
} finally {
  delete process.env.DRIVE_MCP_ALLOWED_UPLOAD_ROOTS;
  delete process.env.DRIVE_MCP_DOWNLOAD_ROOT;
  delete process.env.DRIVE_MCP_MAX_UPLOAD_BYTES;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
