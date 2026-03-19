/**
 * MCP Routes — Server registration and tool discovery API.
 *
 * Sprint 3B: REST endpoints for managing MCP server connections.
 *
 * Routes:
 *   GET    /mcp/servers            — List all registered MCP servers
 *   POST   /mcp/servers            — Register a new MCP server
 *   DELETE /mcp/servers/:id        — Remove a server
 *   GET    /mcp/servers/:id/tools  — List/discover tools from a server
 *   POST   /mcp/servers/:id/sync   — Force tool discovery refresh
 */

import { Hono } from "hono";
import {
  listServers,
  registerServer,
  removeServer,
  getServerTools,
  syncServerTools,
} from "../lib/mcp-registry.js";

export const mcpRoutes = new Hono();

// ─── GET /servers ────────────────────────────────────────────

mcpRoutes.get("/servers", async (c) => {
  const servers = await listServers();
  return c.json({
    count: servers.length,
    servers: servers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      transport: s.transport,
      description: s.description,
      enabled: s.enabled,
      toolCount: s.tools.length,
    })),
  });
});

// ─── POST /servers ───────────────────────────────────────────

mcpRoutes.post("/servers", async (c) => {
  const body = await c.req.json();
  const { name, url, transport, description } = body;

  if (!name || !url) {
    return c.json({ error: "name and url are required" }, 400);
  }

  const validTransports = ["streamable-http", "stdio"];
  if (transport && !validTransports.includes(transport)) {
    return c.json({ error: `transport must be one of: ${validTransports.join(", ")}` }, 400);
  }

  try {
    const server = await registerServer({ name, url, transport, description });
    return c.json({
      ...server,
      message: "Server registered. POST /mcp/servers/:id/sync to discover tools.",
    }, 201);
  } catch (err: any) {
    // Unique constraint violation (duplicate URL)
    if (err.code === "P2002") {
      return c.json({ error: "A server with this URL is already registered" }, 409);
    }
    return c.json({ error: "Failed to register server", details: err.message }, 500);
  }
});

// ─── DELETE /servers/:id ─────────────────────────────────────

mcpRoutes.delete("/servers/:id", async (c) => {
  const serverId = c.req.param("id");

  const removed = await removeServer(serverId);
  if (!removed) {
    return c.json({ error: "Server not found" }, 404);
  }

  return c.json({ message: "Server removed", id: serverId });
});

// ─── GET /servers/:id/tools ──────────────────────────────────

mcpRoutes.get("/servers/:id/tools", async (c) => {
  const serverId = c.req.param("id");

  try {
    const tools = await getServerTools(serverId);
    return c.json({
      serverId,
      count: tools.length,
      tools: tools.map((t) => ({
        name: t.toolName,
        description: t.description ?? null,
        inputSchema: t.inputSchema ?? null,
      })),
    });
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      return c.json({ error: "Server not found" }, 404);
    }
    return c.json({
      error: "Failed to get tools",
      details: err.message,
    }, 500);
  }
});

// ─── POST /servers/:id/sync ─────────────────────────────────

mcpRoutes.post("/servers/:id/sync", async (c) => {
  const serverId = c.req.param("id");

  try {
    const tools = await syncServerTools(serverId, true);
    return c.json({
      serverId,
      message: "Tool discovery complete",
      count: tools.length,
      tools: tools.map((t) => ({
        name: t.toolName,
        description: t.description ?? null,
      })),
    });
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      return c.json({ error: "Server not found" }, 404);
    }
    return c.json({
      error: "Failed to sync tools",
      details: err.message,
      hint: "Is the MCP server running and reachable?",
    }, 500);
  }
});
