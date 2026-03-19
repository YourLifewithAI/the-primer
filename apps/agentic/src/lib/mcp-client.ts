/**
 * MCP Client — Model Context Protocol integration layer.
 *
 * Sprint 3B: Connects to external MCP servers, discovers their tools,
 * and translates them into Mastra-compatible tool definitions.
 *
 * Key design:
 * - Lazy connections: servers are only connected when their tools are needed
 * - Connection caching: one Client instance per server URL, reused across calls
 * - Graceful error isolation: a failing MCP server never crashes the Primer
 * - Supports both streamable-http and stdio transports
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createTool, type Tool } from "@mastra/core/tools";
import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: "streamable-http" | "stdio";
  description?: string | null;
}

export interface McpToolInfo {
  serverId: string;
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

// ─── Connection Cache ────────────────────────────────────────

interface CachedConnection {
  client: Client;
  tools: McpToolInfo[];
  connectedAt: Date;
  serverConfig: McpServerConfig;
}

const connectionCache = new Map<string, CachedConnection>();

// ─── Connection Lifecycle ────────────────────────────────────

/**
 * Get or create a connection to an MCP server.
 * Connections are cached by server URL — calling this twice with the same
 * URL returns the same Client instance.
 */
async function getConnection(config: McpServerConfig): Promise<CachedConnection> {
  const existing = connectionCache.get(config.url);
  if (existing) return existing;

  const client = new Client(
    { name: "primer-agentic", version: "0.3.0" },
    { capabilities: {} },
  );

  let transport;
  if (config.transport === "streamable-http") {
    transport = new StreamableHTTPClientTransport(new URL(config.url));
  } else {
    // stdio: url is treated as the command, e.g. "python mcp_server.py"
    const [command, ...args] = config.url.split(" ");
    transport = new StdioClientTransport({ command, args });
  }

  await client.connect(transport);

  const cached: CachedConnection = {
    client,
    tools: [],
    connectedAt: new Date(),
    serverConfig: config,
  };
  connectionCache.set(config.url, cached);
  return cached;
}

// ─── Tool Discovery ──────────────────────────────────────────

/**
 * Discover tools from an MCP server.
 * Connects if not already connected, fetches the tool list,
 * and caches the result on the connection.
 */
export async function discoverTools(config: McpServerConfig): Promise<McpToolInfo[]> {
  const conn = await getConnection(config);

  // Return cached tools if we already discovered them
  if (conn.tools.length > 0) return conn.tools;

  const result = await conn.client.listTools();

  conn.tools = result.tools.map((t) => ({
    serverId: config.id,
    serverName: config.name,
    toolName: t.name,
    description: t.description ?? undefined,
    inputSchema: t.inputSchema as Record<string, unknown> | undefined,
  }));

  return conn.tools;
}

/**
 * Force-refresh tool discovery for a server (clears cached tools).
 */
export async function refreshTools(config: McpServerConfig): Promise<McpToolInfo[]> {
  const conn = connectionCache.get(config.url);
  if (conn) {
    conn.tools = [];
  }
  return discoverTools(config);
}

// ─── Tool Execution ──────────────────────────────────────────

/**
 * Call a tool on an MCP server and return the text result.
 * Assumes the server is already connected (via discoverTools).
 */
export async function callMcpTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const conn = connectionCache.get(serverUrl);
  if (!conn) {
    return { content: `MCP server not connected: ${serverUrl}`, isError: true };
  }

  const result = await conn.client.callTool({ name: toolName, arguments: args });

  // Extract text content from the MCP result
  const contentItems = "content" in result ? (result.content as Array<{ type: string; text?: string }>) : [];
  const text = contentItems
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");

  return {
    content: text || JSON.stringify(result),
    isError: "isError" in result ? Boolean(result.isError) : false,
  };
}

// ─── Mastra Tool Translation ─────────────────────────────────

type AnyTool = Tool<any, any, any, any, any, any, any>;

/**
 * Convert an MCP tool into a Mastra-compatible tool definition.
 *
 * The generated tool:
 * - Has a prefixed ID to avoid collisions: `mcp_{serverName}_{toolName}`
 * - Accepts arbitrary JSON input (the MCP inputSchema is informational)
 * - Delegates execution to the MCP server via callMcpTool
 * - Returns a simple { result, error? } output
 */
export function mcpToolToMastra(
  tool: McpToolInfo,
  serverUrl: string,
): AnyTool {
  const safeServerName = tool.serverName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const safeToolName = tool.toolName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const toolId = `mcp_${safeServerName}_${safeToolName}`;

  return createTool({
    id: toolId,
    description: `[MCP: ${tool.serverName}] ${tool.description ?? tool.toolName}`,
    inputSchema: z.object({
      arguments: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Arguments to pass to the MCP tool"),
    }),
    outputSchema: z.object({
      result: z.string(),
      error: z.string().optional(),
    }),
    execute: async (input) => {
      try {
        const callArgs = (input as { arguments?: Record<string, unknown> }).arguments ?? {};
        const response = await callMcpTool(serverUrl, tool.toolName, callArgs);
        if (response.isError) {
          return { result: "", error: response.content };
        }
        return { result: response.content, error: undefined };
      } catch (err: any) {
        return {
          result: "",
          error: `MCP tool call failed: ${err.message ?? "Unknown error"}`,
        };
      }
    },
  });
}

// ─── Cleanup ─────────────────────────────────────────────────

/**
 * Disconnect from a specific MCP server and remove it from cache.
 */
export async function disconnectServer(serverUrl: string): Promise<void> {
  const conn = connectionCache.get(serverUrl);
  if (conn) {
    try {
      await conn.client.close();
    } catch {
      // Best-effort cleanup
    }
    connectionCache.delete(serverUrl);
  }
}

/**
 * Disconnect from all MCP servers. Called during graceful shutdown.
 */
export async function disconnectAll(): Promise<void> {
  const urls = Array.from(connectionCache.keys());
  await Promise.allSettled(urls.map((url) => disconnectServer(url)));
}

/**
 * Get connection status for all cached servers.
 */
export function getConnectionStatus(): Array<{
  url: string;
  name: string;
  toolCount: number;
  connectedAt: Date;
}> {
  return Array.from(connectionCache.values()).map((conn) => ({
    url: conn.serverConfig.url,
    name: conn.serverConfig.name,
    toolCount: conn.tools.length,
    connectedAt: conn.connectedAt,
  }));
}
