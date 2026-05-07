import { Hono } from "hono";
import { z } from "zod";
import { dataStore } from "../data/seed";

const router = new Hono();

const JobSchema = z.object({
  title: z.string().min(1),
  clientId: z.string(),
  location: z.string().optional(),
  type: z.enum(["permanent", "contract", "temp", "interim"]),
  status: z.enum(["draft", "active", "on_hold", "filled", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  estimatedFee: z.number().optional(),
});

// GET /api/v1/jobs
router.get("/", (c) => {
  const status = c.req.query("status");
  let filtered = dataStore.jobs;

  if (status && status !== "all") {
    filtered = filtered.filter((j) => j.status === status);
  }

  return c.json({ data: filtered });
});

// GET /api/v1/jobs/:id
router.get("/:id", (c) => {
  const id = c.req.param("id");
  const job = dataStore.jobs.find((j) => j.id === id);

  if (!job) {
    return c.json({ error: "Not found" }, 404);
  }

  const applications = dataStore.applications
    .filter((a) => a.jobId === id)
    .map((a) => ({
      ...a,
      candidate: dataStore.candidates.find((c) => c.id === a.candidateId),
    }));

  return c.json({
    data: { ...job, applications },
  });
});

// POST /api/v1/jobs
router.post("/", async (c) => {
  const body = await c.req.json();
  const result = JobSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error.errors }, 400);
  }

  const newJob = {
    id: `j${Math.random().toString(36).substr(2, 9)}`,
    ...result.data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    applicationCount: 0,
  };

  dataStore.jobs.push(newJob);
  return c.json({ data: newJob }, 201);
});

// PATCH /api/v1/jobs/:id
router.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const idx = dataStore.jobs.findIndex((j) => j.id === id);

  if (idx === -1) {
    return c.json({ error: "Not found" }, 404);
  }

  const updated = {
    ...dataStore.jobs[idx],
    ...body,
    updatedAt: new Date().toISOString(),
  };

  dataStore.jobs[idx] = updated;
  return c.json({ data: updated });
});

// POST /api/v1/jobs/:id/pipeline/entries/:eid/submit-to-portal
router.post("/:id/pipeline/entries/:eid/submit-to-portal", async (c) => {
  const jobId = c.req.param("id");
  const appId = c.req.param("eid");
  const idx = dataStore.applications.findIndex((a) => a.id === appId);

  if (idx === -1) {
    return c.json({ error: "Not found" }, 404);
  }

  const updated = {
    ...dataStore.applications[idx],
    submittedToClientAt: new Date().toISOString(),
  };

  dataStore.applications[idx] = updated;
  return c.json({ data: updated });
});

export default router;
