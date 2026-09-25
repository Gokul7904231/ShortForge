import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { GoogleDriveClient } from "./drive-client.js";

const server = new McpServer({
  name: "shortforge-google-drive",
  version: "0.1.0",
  description:
    "ShortForge-owned Google Drive MCP for bounded operator access to Drive files, folders, and Workspace exports.",
});

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function getClient() {
  return new GoogleDriveClient();
}

server.registerTool(
  "drive_health",
  {
    title: "Drive health",
    description: "Check Google Drive authentication, reachability, optional root-folder access, and quota.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return jsonResult(await getClient().health());
    } catch (error) {
      return jsonResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
);

server.registerTool(
  "drive_list",
  {
    title: "List Drive files",
    description: "List non-trashed files under a folder/root with bounded pagination.",
    inputSchema: z.object({
      folderId: z.string().optional(),
      pageSize: z.number().int().min(1).max(1000).optional(),
      pageToken: z.string().optional(),
      query: z.string().max(200).optional(),
    }),
  },
  async (input) => jsonResult(await getClient().list(input))
);

server.registerTool(
  "drive_search",
  {
    title: "Search Drive",
    description: "Search Drive by file name. This is metadata search, not semantic search.",
    inputSchema: z.object({
      query: z.string().min(1).max(200),
      pageSize: z.number().int().min(1).max(1000).optional(),
      pageToken: z.string().optional(),
    }),
  },
  async (input) => jsonResult(await getClient().search(input))
);

server.registerTool(
  "drive_get_metadata",
  {
    title: "Get Drive metadata",
    description: "Read metadata, capabilities, and provider checksum information for one Drive file.",
    inputSchema: z.object({
      fileId: z.string().min(1),
    }),
  },
  async ({ fileId }) => jsonResult(await getClient().metadata(fileId))
);

server.registerTool(
  "drive_create_folder",
  {
    title: "Create Drive folder",
    description: "Create a folder. Requires GOOGLE_DRIVE_MCP_SCOPE_MODE=readwrite.",
    inputSchema: z.object({
      name: z.string().min(1).max(200),
      parentId: z.string().optional(),
    }),
  },
  async (input) => jsonResult(await getClient().createFolder(input.name, input.parentId))
);

server.registerTool(
  "drive_upload",
  {
    title: "Upload file to Drive",
    description:
      "Upload a local file from an explicitly allowlisted root. " +
      "Does not grant public sharing and never changes Drive permissions.",
    inputSchema: z.object({
      sourcePath: z.string().min(1),
      folderId: z.string().optional(),
      fileName: z.string().max(255).optional(),
      mimeType: z.string().max(200).optional(),
      description: z.string().max(1000).optional(),
    }),
  },
  async (input) => jsonResult(await getClient().upload(input))
);

server.registerTool(
  "drive_download",
  {
    title: "Download Drive file",
    description: "Download one Drive file into the bounded DRIVE_MCP_DOWNLOAD_ROOT.",
    inputSchema: z.object({
      fileId: z.string().min(1),
      destinationPath: z.string().max(500).optional(),
    }),
  },
  async (input) => jsonResult(await getClient().download(input.fileId, input.destinationPath))
);

server.registerTool(
  "drive_export",
  {
    title: "Export Google Workspace file",
    description:
      "Export a Google Docs/Sheets/Slides file to a supported MIME type and save it to the bounded download root.",
    inputSchema: z.object({
      fileId: z.string().min(1),
      mimeType: z.string().min(1).max(200),
      destinationPath: z.string().max(500).optional(),
    }),
  },
  async (input) =>
    jsonResult(await getClient().exportFile(input.fileId, input.mimeType, input.destinationPath))
);

void serveStdio(() => server);
