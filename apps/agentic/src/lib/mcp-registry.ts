/**
 * MCP Registry — Server and tool discovery service.
 *
 * Sprint 3B: Manages the registry of MCP servers, discovers their tools,
 * and provides Mastra-compatible tool definitions for agent creation.
 *
 * This is the bridge between the database (McpServer/McpCapability tables)
 * and the runtime (agent-runtime.ts). It:
 * - Lists available MCP servers from the database
 * - Triggers tool discovery via the MCP client
 * - Syncs discovered tools back to the McpCapability table
 * - Provides getToolsForAgent() — the single method agent-runtime needs
 */

import { db } from "./db.js";
import { Prisma } from "../generated/prisma/index.js";
import {
  discoverTools,
  refreshTools,
  mcpToolToMastra,
  disconnectServer,
  type McpServerConfig,
  type McpToolInfo,
} from "./mcp-client.js";
import type { Tool } from "@mastra/core/tools";

// ─── Types ───────────────────────────────────────────────────

type AnyTool = Tool<any, any, any, any, any, any, any>;

export interface McpServerWithTools {
  id: string;
  name: string;
  url: string;
  transport: string;
  description: string | null;
  enabled: boolean;
  tools: McpToolInfo[];
}

// ─── Tool Cache ──────────────────────────────────────────────
// In-memory cache of Mastra tool definitions, keyed by server ID.
// Invalidated on sync or server removal.

const mastraToolCache = new Map<string, AnyTool[]>();

// ─── Server Management ───────────────────────────────────────

/**
 * List all registered MCP servers.
 */
export async function listServers(): Promise<McpServerWithTools[]> {
  const servers = await db.mcpServer.findMany({
    include: { capabilities: true },
    orderBy: { name: "asc" },
  });

  return servers.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    transport: s.transport,
    description: s.description,
    enabled: s.enabled,
    tools: s.capabilities.map((c) => ({
      serverId: s.id,
      serverName: s.name,
      toolName: c.toolName,
      description: c.description ?? undefined,
      inputSchema: c.inputSchema as Record<string, unknown> | undefined,
    })),
  }));
}

/**
 * Register a new MCP server.
 */
export async function registerServer(params: {
  name: string;
  url: string;
  transport?: string;
  description?: string;
}): Promise<{ id: string; name: string; url: string }> {
  const server = await db.mcpServer.create({
    data: {
      name: params.name,
      url: params.url,
      transport: params.transport ?? "streamable-http",
      description: params.description ?? null,
    },
  });
  return { id: server.id, name: server.name, url: server.url };
}

/**
 * Remove an MCP server and disconnect from it.
 */
export async function removeServer(serverId: string): Promise<boolean> {
  const server = await db.mcpServer.findUnique({ where: { id: serverId } });
  if (!server) return false;

  // Disconnect the live client
  await disconnectServer(server.url);

  // Clear tool cache
  mastraToolCache.delete(serverId);

  // Cascade delete handles McpCapability rows
  await db.mcpServer.delete({ where: { id: serverId } });
  return true;
}

// ─── Tool Discovery & Sync ───────────────────────────────────

function toServerConfig(server: { id: string; name: string; url: string; transport: string }): McpServerConfig {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    transport: server.transport as "streamable-http" | "stdio",
  };
}

/**
 * Discover tools from a specific server and sync to the database.
 * Returns the discovered tools.
 */
export async function syncServerTools(serverId: string, force = false): Promise<McpToolInfo[]> {
  const server = await db.mcpServer.findUnique({ where: { id: serverId } });
  if (!server) throw new Error(`MCP server not found: ${serverId}`);
  if (!server.enabled) return [];

  const config = toServerConfig(server);

  let tools: McpToolInfo[];
  try {
    tools = force ? await refreshTools(config) : await discoverTools(config);
  } catch (err: any) {
    console.error(`[mcp-registry] Failed to discover tools from ${server.name}: ${err.message}`);
    throw err;
  }

  // Sync to database: upsert each tool, remove stale ones
  const discoveredNames = new Set(tools.map((t) => t.toolName));

  // Upsert discovered tools
  for (const tool of tools) {
    await db.mcpCapability.upsert({
      where: {
        serverId_toolName: { serverId, toolName: tool.toolName },
      },
      create: {
        serverId,
        toolName: tool.toolName,
        description: tool.description ?? null,
        inputSchema: (tool.inputSchema ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      update: {
        description: tool.description ?? null,
        inputSchema: (tool.inputSchema ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  // Remove tools that no longer exist on the server
  await db.mcpCapability.deleteMany({
    where: {
      serverId,
      toolName: { notIn: Array.from(discoveredNames) },
    },
  });

  // Invalidate Mastra tool cache for this server
  mastraToolCache.delete(serverId);

  return tools;
}

/**
 * Get tools from a specific server, formatted for listing/display.
 * Uses cached discovery data if available; connects lazily if needed.
 */
export async function getServerTools(serverId: string): Promise<McpToolInfo[]> {
  const server = await db.mcpServer.findUnique({
    where: { id: serverId },
    include: { capabilities: true },
  });
  if (!server) throw new Error(`MCP server not found: ${serverId}`);

  // If we have capabilities in the DB, return them without connecting
  if (server.capabilities.length > 0) {
    return server.capabilities.map((c) => ({
      serverId: server.id,
      serverName: server.name,
      toolName: c.toolName,
      description: c.description ?? undefined,
      inputSchema: c.inputSchema as Record<string, unknown> | undefined,
    }));
  }

  // Otherwise, discover (lazy connect)
  return syncServerTools(serverId);
}

// ─── Agent Integration ───────────────────────────────────────

/**
 * Get all MCP tools as Mastra tool definitions, ready to merge into
 * an agent's tool record.
 *
 * This is the primary method consumed by agent-runtime.ts.
 * Only returns tools from enabled servers.
 */
export async function getToolsForAgent(): Promise<AnyTool[]> {
  const servers = await db.mcpServer.findMany({
    where: { enabled: true },
    include: { capabilities: true },
  });

  const allTools: AnyTool[] = [];

  for (const server of servers) {
    // Check cache first
    const cached = mastraToolCache.get(server.id);
    if (cached) {
      allTools.push(...cached);
      continue;
    }

    // Build Mastra tools from DB capabilities (no live connection needed
    // if tools were previously synced)
    const tools: McpToolInfo[] = server.capabilities.map((c) => ({
      serverId: server.id,
      serverName: server.name,
      toolName: c.toolName,
      description: c.description ?? undefined,
      inputSchema: c.inputSchema as Record<string, unknown> | undefined,
    }));

    if (tools.length === 0) {
      // No cached capabilities — skip this server.
      // Tools will be available after the first sync.
      continue;
    }

    const mastraTools = tools.map((t) => mcpToolToMastra(t, server.url));
    mastraToolCache.set(server.id, mastraTools);
    allTools.push(...mastraTools);
  }

  return allTools;
}
