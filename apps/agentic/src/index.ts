import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { agentRoutes } from "./routes/agents.js";
import { courseRoutes } from "./routes/courses.js";
import { taskRoutes } from "./routes/tasks.js";
import { assessRoutes } from "./routes/assess.js";
import { specializationRoutes } from "./routes/specializations.js";
import { runtimeRoutes } from "./routes/runtime.js";
import { startWorker, shutdown } from "./lib/agent-runner.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/", (c) => c.json({
  name: "The Agentic Primer",
  version: "0.3.0",
  status: "operational"
}));

// Routes
app.route("/agents", agentRoutes);
app.route("/courses", courseRoutes);
app.route("/tasks", taskRoutes);
app.route("/assess", assessRoutes);
app.route("/specializations", specializationRoutes);

// Sprint 3A: Agent runtime routes (nested under /agents/:id)
app.route("/agents", runtimeRoutes);

// Start BullMQ worker for agent runs (no-op if Redis unavailable — queue lazy-inits)
try {
  startWorker();
  console.log("[agent-runner] BullMQ worker started");
} catch (err) {
  console.warn("[agent-runner] Failed to start worker (Redis unavailable?):", (err as Error).message);
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[shutdown] SIGTERM received, draining worker...");
  await shutdown();
  process.exit(0);
});
process.on("SIGINT", async () => {
  console.log("[shutdown] SIGINT received, draining worker...");
  await shutdown();
  process.exit(0);
});

// Start
const port = Number(process.env.PORT) || 3002;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🎓 Agentic Primer running on http://localhost:${info.port}`);
});

export default app;
