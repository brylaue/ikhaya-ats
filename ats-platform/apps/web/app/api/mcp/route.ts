/**
 * MCP Server — US-440: Expose ATS as MCP Tools & Resources
 *
 * Implements a lightweight MCP-compatible JSON endpoint at /api/mcp.
 * External AI clients (Claude Desktop, Cowork) can discover and call
 * tools after OAuth authorization via mcp_oauth_clients.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Auth: Bearer token (OAuth 2.1 w/ PKCE — US-442 scopes)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { createHash } from "crypto";

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_candidates",
    description: "Search candidates in the talent pool by skills, title, or location",
    inputSchema: {
      type: "object",
      properties: {
        query:    { type: "string",  description: "Search query" },
        skills:   { type: "array",  items: { type: "string" } },
        location: { type: "string" },
        limit:    { type: "number", default: 10 },
      },
    },
    requiredScope: "candidates:read",
  },
  {
    name: "get_candidate",
    description: "Get full candidate profile by ID",
    inputSchema: {
      type: "object",
      properties: { candidateId: { type: "string", description: "Candidate UUID" } },
      required: ["candidateId"],
    },
    requiredScope: "candidates:read",
  },
  {
    name: "list_jobs",
    description: "List active job requisitions",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "draft", "on_hold", "closed"] },
        limit:  { type: "number", default: 20 },
      },
    },
    requiredScope: "jobs:read",
  },
  {
    name: "get_job",
    description: "Get a job requisition by ID",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
    requiredScope: "jobs:read",
  },
  {
    name: "move_pipeline_stage",
    description: "Move a candidate to a different pipeline stage on a job",
    inputSchema: {
      type: "object",
      properties: {
        applicationId: { type: "string" },
        stageId:       { type: "string" },
        reason:        { type: "string" },
      },
      required: ["applicationId", "stageId"],
    },
    requiredScope: "pipeline:write",
  },
  {
    name: "add_candidate_note",
    description: "Add a note to a candidate profile",
    inputSchema: {
      type: "object",
      properties: {
        candidateId: { type: "string" },
        note:        { type: "string" },
      },
      required: ["candidateId", "note"],
    },
    requiredScope: "candidates:write",
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  input: Record<string, any>,
  supabase: any,
  agency: { id: string; userId: string; role: string },
) {
  switch (name) {
    case "search_candidates": {
      let q = supabase.from("candidates")
        .select("id, first_name, last_name, headline, location, status")
        .eq("agency_id", agency.id)
        .limit(input.limit ?? 10);
      if (input.query) q = q.or(`first_name.ilike.%${input.query}%,last_name.ilike.%${input.query}%,headline.ilike.%${input.query}%`);
      if (input.location) q = q.ilike("location", `%${input.location}%`);
      const { data } = await q;
      return { candidates: data ?? [] };
    }
    case "get_candidate": {
      const { data } = await supabase.from("candidates")
        .select("id, first_name, last_name, headline, location, status, email, phone, linkedin_url, created_at")
        .eq("id", input.candidateId).eq("agency_id", agency.id).single();
      return data ?? { error: "Not found" };
    }
    case "list_jobs": {
      let q = supabase.from("jobs")
        .select("id, title, status, location, salary_min, salary_max, created_at")
        .eq("agency_id", agency.id)
        .limit(input.limit ?? 20);
      if (input.status) q = q.eq("status", input.status);
      else q = q.eq("status", "active");
      const { data } = await q;
      return { jobs: data ?? [] };
    }
    case "get_job": {
      const { data } = await supabase.from("jobs")
        .select("*").eq("id", input.jobId).eq("agency_id", agency.id).single();
      return data ?? { error: "Not found" };
    }
    case "move_pipeline_stage": {
      // Scope the update to this agency so a leaked applicationId from another
      // agency cannot be moved. PostgREST update ignores rows that don't match.
      const { data, error } = await supabase.from("applications")
        .update({ stage_id: input.stageId, updated_at: new Date().toISOString() })
        .eq("id", input.applicationId)
        .eq("agency_id", agency.id)
        .select("id");
      if (error) return { error: error.message };
      if (!data?.length) return { error: "Application not found in this agency" };
      return { success: true };
    }
    case "add_candidate_note": {
      // Ownership check before writing the activity row — otherwise a caller
      // could attach a note to any candidate UUID (IDOR).
      const { data: cand } = await supabase.from("candidates")
        .select("id").eq("id", input.candidateId).eq("agency_id", agency.id).maybeSingle();
      if (!cand) return { error: "Candidate not found in this agency" };
      const { error } = await supabase.from("activities").insert({
        org_id:      agency.id,
        entity_type: "candidate",
        entity_id:   input.candidateId,
        type:        "note",
        summary:     input.note,
      });
      return error ? { error: error.message } : { success: true };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/mcp — return tool list (discovery) */
export async function GET() {
  return NextResponse.json({
    protocol: "mcp/1.0",
    tools: TOOLS.map(({ requiredScope: _, ...t }) => t),
    resources: [
      { uri: "ats://candidates", description: "All candidates in talent pool" },
      { uri: "ats://jobs",       description: "All job requisitions" },
    ],
  });
}

/** POST /api/mcp — handle JSON-RPC 2.0 tool call */
export async function POST(req: NextRequest) {
  let id: string | number | null = null;
  try {
    const supabase = await createClient();
    const body = await req.json();
    id = body?.id ?? null;
    const { method, params } = body ?? {};

    // Resolve caller → either via Bearer token (US-498) or session cookie fallback.
    const authed = await authenticateCaller(req, supabase);
    if (!authed) {
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32001, message: "Unauthorized" } },
        { status: 401 },
      );
    }
    const { agency, grantedScopes } = authed;

    if (method === "tools/list") {
      // Filter the list to tools the caller has scopes for — prevents discovery
      // of write tools by read-only tokens.
      const visible = TOOLS.filter(t => grantedScopes === "*" || grantedScopes.has(t.requiredScope));
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { tools: visible.map(({ requiredScope: _, ...t }) => t) },
      });
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params ?? {};
      if (!name) return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "tool name required" } });

      const tool = TOOLS.find(t => t.name === name);
      if (!tool) return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "tool not found" } });

      // US-497: enforce per-tool scope before execution.
      if (grantedScopes !== "*" && !grantedScopes.has(tool.requiredScope)) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32001, message: `Missing required scope: ${tool.requiredScope}` },
        }, { status: 403 });
      }

      const result = await handleTool(name, args ?? {}, supabase, agency);

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
      });
    }

    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
  } catch (err: any) {
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message } }, { status: 500 });
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
// US-498: support both Bearer tokens (for external OAuth clients) and session
// cookies (for in-app calls). Scopes are attached to the authed result so
// handler can run US-497 checks before dispatching tools.

type AuthedContext = {
  agency: { id: string; userId: string; role: string };
  /** "*" = full-session cookie; otherwise a Set<string> of granted scopes. */
  grantedScopes: "*" | Set<string>;
};

async function authenticateCaller(req: NextRequest, supabase: any): Promise<AuthedContext | null> {
  // Prefer Bearer token if the client sent one — external OAuth clients use this.
  const authz = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authz)?.[1]?.trim();

  if (bearer) {
    // Tokens are stored hashed (see migration 074). Hash the incoming Bearer
    // with sha256 → base64url and look it up; raw plaintext never touches
    // the DB or our logs.
    const tokenHash = createHash("sha256").update(bearer).digest("base64url");

    const { data: token } = await supabase
      .from("mcp_access_tokens")
      .select("id, client_id, agency_id, user_id, scopes, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!token) return null;
    if (token.revoked_at) return null;
    if (token.expires_at && new Date(token.expires_at) <= new Date()) return null;

    // Fire-and-forget touch so admins can see when a token was last used.
    // If this update fails (e.g. RLS on service role), we still authenticate.
    try {
      await supabase
        .from("mcp_access_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", token.id);
      await supabase
        .from("mcp_oauth_clients")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", token.client_id as string);
    } catch {
      // non-fatal
    }

    const scopeArr: string[] = Array.isArray(token.scopes) ? token.scopes : [];
    return {
      agency: {
        id:     token.agency_id as string,
        userId: (token.user_id as string) ?? "",
        role:   "mcp_client",
      },
      grantedScopes: new Set(scopeArr),
    };
  }

  // Session-cookie fallback — in-app or dev calls.
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return null;
  return {
    agency: { id: ctx.agencyId, userId: ctx.userId, role: ctx.role },
    grantedScopes: "*",
  };
}
