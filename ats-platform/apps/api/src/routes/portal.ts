import { Hono } from "hono";
import { z } from "zod";
import { dataStore } from "../data/seed";

const router = new Hono();

const FeedbackSchema = z.object({
  decision: z.enum(["advance", "hold", "pass"]),
  reason: z.string().optional(),
  note: z.string().optional(),
});

// GET /api/v1/portal/:slug
router.get("/:slug", (c) => {
  const slug = c.req.param("slug");
  const client = dataStore.clients.find((cl) => cl.portalSlug === slug);

  if (!client) {
    return c.json({ error: "Portal not found" }, 404);
  }

  return c.json({ data: client });
});

// GET /api/v1/portal/:slug/submissions
router.get("/:slug/submissions", (c) => {
  const slug = c.req.param("slug");
  const client = dataStore.clients.find((cl) => cl.portalSlug === slug);

  if (!client) {
    return c.json({ error: "Portal not found" }, 404);
  }

  const jobs = dataStore.jobs.filter((j) => j.clientId === client.id);
  const jobIds = jobs.map((j) => j.id);
  const submissions = dataStore.applications
    .filter(
      (a) => jobIds.includes(a.jobId) && a.submittedToClientAt
    )
    .map((a) => ({
      ...a,
      candidate: dataStore.candidates.find((c) => c.id === a.candidateId),
      job: dataStore.jobs.find((j) => j.id === a.jobId),
    }));

  return c.json({ data: { client, jobs, submissions } });
});

// POST /api/v1/portal/:slug/feedback
router.post("/:slug/feedback", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const result = FeedbackSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error.errors }, 400);
  }

  const client = dataStore.clients.find((cl) => cl.portalSlug === slug);
  if (!client) {
    return c.json({ error: "Portal not found" }, 404);
  }

  // Log feedback (in production, store this)
  console.log(`[Portal ${slug}] Feedback:`, result.data);

  return c.json({ data: { success: true, feedback: result.data } });
});

export default router;
