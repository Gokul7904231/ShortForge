import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { WebSocket, WebSocketServer } from "ws";

export const COLAB_BROWSER_ORIGINS = [
  "https://colab.google.com",
  "https://colab.research.google.com",
] as const;

const DEFAULT_NOTEBOOK_URL =
  "https://colab.research.google.com/notebooks/empty.ipynb";

export type ColabBrowserSessionState =
  | "WAITING_FOR_BROWSER"
  | "CONNECTED"
  | "DISCONNECTED";

export interface ColabBrowserSession {
  sessionId: string;
  notebookUrl: string;
  connectUrl: string;
  manualConnection: string;
  port: number;
  state: ColabBrowserSessionState;
  connectedAt?: string;
  disconnectedAt?: string;
  lastMessageAt?: string;
  lastMethodSeen?: string;
}

export interface OpenColabBrowserConnectionOptions {
  notebookUrl?: string;
  authuser?: string;
  openBrowser?: boolean;
}

interface InternalSession extends ColabBrowserSession {
  token: string;
  server: WebSocketServer;
  socket?: WebSocket;
}

function invalid(message: string): Error {
  return new Error("COLAB_BROWSER_INVALID_INPUT: " + message);
}

export function validateNotebookUrl(input?: string): string {
  const value = (input || DEFAULT_NOTEBOOK_URL).trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw invalid("notebook_url must be a valid HTTPS Colab URL.");
  }

  if (url.protocol !== "https:") {
    throw invalid("notebook_url must use HTTPS.");
  }

  if (!COLAB_BROWSER_ORIGINS.includes(url.origin as (typeof COLAB_BROWSER_ORIGINS)[number])) {
    throw invalid(
      "notebook_url must use colab.google.com or colab.research.google.com.",
    );
  }

  const allowedPath =
    url.pathname.startsWith("/drive/") ||
    url.pathname.startsWith("/github/") ||
    url.pathname.startsWith("/notebooks/");

  if (!allowedPath) {
    throw invalid(
      "notebook_url must target a Colab notebook (/drive/, /github/, or /notebooks/).",
    );
  }

  url.hash = "";
  return url.toString();
}

function buildConnectionUrl(
  notebookUrl: string,
  token: string,
  port: number,
  authuser?: string,
): string {
  const url = new URL(notebookUrl);

  // A unique query nonce avoids Chrome reusing an older canonical Colab tab
  // whose fragment still points at a stale MCP port/token.
  url.searchParams.set("sf_mcp_nonce", randomUUID());

  if (authuser !== undefined) {
    if (!/^\d+$/.test(authuser)) {
      throw invalid("authuser must be a numeric Google account selector.");
    }
    url.searchParams.set("authuser", authuser);
  }

  url.hash =
    "mcpProxyToken=" +
    encodeURIComponent(token) +
    "&mcpProxyPort=" +
    encodeURIComponent(String(port));

  return url.toString();
}

async function openExternalUrl(url: string): Promise<void> {
  const child =
    process.platform === "win32"
      ? spawn("cmd", ["/c", "start", "", url], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        })
      : process.platform === "darwin"
        ? spawn("open", [url], { detached: true, stdio: "ignore" })
        : spawn("xdg-open", [url], { detached: true, stdio: "ignore" });

  child.unref();
}

function isAllowedOrigin(origin: string | undefined): boolean {
  return (
    origin === undefined ||
    COLAB_BROWSER_ORIGINS.includes(origin as (typeof COLAB_BROWSER_ORIGINS)[number])
  );
}

function isAuthorized(
  requestUrl: URL,
  authorization: string | undefined,
  token: string,
): boolean {
  const queryToken = requestUrl.searchParams.get("access_token");
  if (queryToken === token) return true;

  if (!authorization) return false;

  const [scheme, supplied] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && supplied === token;
}

/**
 * Local compatibility layer inspired by Google's official Colab MCP browser
 * bridge. It owns localhost session endpoints and validates Colab-origin
 * connections, but does not grant F06 worker authority.
 */
export class ColabBrowserBridgeManager {
  private readonly sessions = new Map<string, InternalSession>();

  async open(
    options: OpenColabBrowserConnectionOptions = {},
  ): Promise<ColabBrowserSession> {
    const notebookUrl = validateNotebookUrl(options.notebookUrl);
    const token = randomUUID().replace(/-/g, "");
    const sessionId = randomUUID();

    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
      handleProtocols: (protocols) =>
        protocols.has("mcp") ? "mcp" : false,
    });

    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        server.off("listening", onListening);
        server.off("error", onError);
      };

      server.once("listening", onListening);
      server.once("error", onError);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw new Error(
        "COLAB_BROWSER_SERVER_FAILED: failed to acquire a local TCP port.",
      );
    }

    const port = address.port;
    const connectUrl = buildConnectionUrl(
      notebookUrl,
      token,
      port,
      options.authuser,
    );

    const session: InternalSession = {
      sessionId,
      notebookUrl,
      connectUrl,
      manualConnection: token + "&" + String(port),
      port,
      state: "WAITING_FOR_BROWSER",
      token,
      server,
    };

    server.on("connection", (socket, request) => {
      const requestUrl = new URL(
        request.url || "/",
        "http://127.0.0.1:" + String(port),
      );

      if (!isAllowedOrigin(request.headers.origin)) {
        socket.close(1008, "Unauthorized origin");
        return;
      }

      if (
        !isAuthorized(
          requestUrl,
          request.headers.authorization,
          session.token,
        )
      ) {
        socket.close(1008, "Unauthorized Colab MCP connection");
        return;
      }

      if (session.socket?.readyState === WebSocket.OPEN) {
        socket.close(1013, "A Colab browser connection is already active");
        return;
      }

      session.socket = socket;
      session.state = "CONNECTED";
      session.connectedAt = new Date().toISOString();
      session.disconnectedAt = undefined;

      socket.on("message", (payload) => {
        session.lastMessageAt = new Date().toISOString();

        try {
          const parsed = JSON.parse(payload.toString()) as {
            method?: unknown;
          };
          if (typeof parsed.method === "string") {
            session.lastMethodSeen = parsed.method;
          }
        } catch {
          // Transport tracker only. The actual MCP bridge owns JSON-RPC
          // validation and request semantics.
        }
      });

      const markDisconnected = () => {
        if (session.socket === socket) {
          session.socket = undefined;
          session.state = "DISCONNECTED";
          session.disconnectedAt = new Date().toISOString();
        }
      };

      socket.once("close", markDisconnected);
      socket.once("error", markDisconnected);
    });

    this.sessions.set(sessionId, session);

    if (options.openBrowser) {
      await openExternalUrl(connectUrl);
    }

    return this.publicView(session);
  }

  status(sessionId?: string): ColabBrowserSession[] {
    const sessions = sessionId
      ? [this.sessions.get(sessionId)].filter(
          (session): session is InternalSession => Boolean(session),
        )
      : Array.from(this.sessions.values());

    return sessions.map((session) => this.publicView(session));
  }

  disconnect(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.socket?.close(1000, "Disconnected by ShortForge");
    session.socket = undefined;
    session.state = "DISCONNECTED";
    session.disconnectedAt = new Date().toISOString();
    return true;
  }

  async close(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.socket?.close(1000, "Closed by ShortForge");
    await new Promise<void>((resolve) => {
      session.server.close(() => resolve());
    });
    this.sessions.delete(sessionId);
    return true;
  }

  async closeAll(): Promise<void> {
    for (const sessionId of Array.from(this.sessions.keys())) {
      await this.close(sessionId);
    }
  }

  private publicView(session: InternalSession): ColabBrowserSession {
    const {
      token: _token,
      server: _server,
      socket: _socket,
      ...view
    } = session;
    return view;
  }
}
