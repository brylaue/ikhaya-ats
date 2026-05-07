import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth";
import candidatesRouter from "./routes/candidates";
import jobsRouter from "./routes/jobs";
import portalRouter from "./routes/portal";

const app = new Hono();

// Middleware
app.use(logger());
app.use(
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);
app.use("*", authMiddleware);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Routes
app.route("/api/v1/candidates", candidatesRouter);
app.route("/api/v1/jobs", jobsRouter);
app.route("/api/v1/portal", portalRouter);

// 404
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

// Start server
const port = process.env.PORT || 3001;
console.log(`API server running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port: Number(port),
});
