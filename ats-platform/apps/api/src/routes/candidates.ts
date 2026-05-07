import { Hono } from "hono";
import { z } from "zod";
import { dataStore } from "../data/seed";

const router = new Hono();

// Zod schema for candidate
const CandidateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["active", "passive", "not_looking", "placed", "do_not_contact"]),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/v1/candidates
router.get("/", (c) => {
  const query = c.req.query("q");
  const status = c.req.query("status");
  const tags = c.req.query("tags");

  let filtered = dataStore.candidates;

  if (query) {
    filtered = filtered.filter(
      (c) =>
        c.fullName.toLowerCase().includes(query.toLowerCase()) ||
        c.email.toLowerCase().includes(query.toLowerCase())
    );
  }

  if (status && status !== "all") {
    filtered = filtered.filter((c) => c.status === status);
  }

  return c.json({ data: filtered });
});

// GET /api/v1/candidates/:id
router.get("/:id", (c) => {
  const id = c.req.param("id");
  const candidate = dataStore.candidates.find((c) => c.id === id);

  if (!candidate) {
    return c.json({ error: "Not found" }, 404);
  }

  // Mock activities
  const activities = [
    {
      id: "a1",
      type: "email",
      summary: "Email sent",
      date: candidate.updatedAt,
    },
  ];

  return c.json({ data: { ...candidate, activities } });
});

// POST /api/v1/candidates
router.post("/", async (c) => {
  const body = await c.req.json();
  const result = CandidateSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error.errors }, 400);
  }

  const newCandidate = {
    id: `cand${Math.random().toString(36).substr(2, 9)}`,
    fullName: `${result.data.firstName} ${result.data.lastName}`,
    ...result.data,
    skills: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  dataStore.candidates.push(newCandidate);
  return c.json({ data: newCandidate }, 201);
});

// PATCH /api/v1/candidates/:id
router.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const idx = dataStore.candidates.findIndex((c) => c.id === id);

  if (idx === -1) {
    return c.json({ error: "Not found" }, 404);
  }

  const updated = {
    ...dataStore.candidates[idx],
    ...body,
    updatedAt: new Date().toISOString(),
  };

  dataStore.candidates[idx] = updated;
  return c.json({ data: updated });
});

export default router;
