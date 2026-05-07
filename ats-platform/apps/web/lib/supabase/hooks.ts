"use client";

/**
 * Client-side React hooks for Supabase data fetching.
 * All queries are scoped to the authenticated user's agency via RLS.
 */

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "./client";
import { getAgencyContext } from "./agency-cache";
import { hasPermission, type Permission, type UserRole } from "@/lib/permissions";
import { hasFeature, type FeatureKey, type Plan } from "@/lib/feature-flags";
import type {
  Candidate, CandidateStatus,
  Job, JobStatus, JobType,
} from "@/types";

// ─── DB → Frontend mappers ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCandidate(row: any): Candidate {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    email: row.email ?? "",
    phone: row.phone ?? undefined,
    currentTitle: row.current_title ?? undefined,
    currentCompany: row.current_company ?? undefined,
    location: row.location ? { city: row.location } : undefined,
    linkedinUrl: row.linkedin_url ?? undefined,
    portfolioUrl: row.portfolio_url ?? undefined,
    status: (row.status ?? "active") as CandidateStatus,
    source: row.source ?? undefined,
    tags: [],
    skills: ((row.skills ?? []) as string[]).map((s) => ({
      skillId: s,
      skill: { id: s, name: s, category: "General", normalizedName: s.toLowerCase() },
      proficiencyLevel: "intermediate" as const,
      yearsExperience: 0,
      source: "parsed" as const,
    })),
    desiredSalary: row.desired_salary_max ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJob(row: any): Job & { companyName?: string; remotePolicy?: string; jobType?: string; feeType?: string; portalVisible?: boolean; type: JobType } {
  return {
    id: row.id,
    title: row.title,
    clientId: row.company_id ?? "",
    client: row.companies ? { id: row.company_id, name: row.companies.name, portalSlug: row.companies.portal_slug ?? "", createdAt: row.companies.created_at ?? row.created_at } : undefined,
    location: row.location ?? undefined,
    remotePolicy: row.remote_policy ?? undefined,
    type: row.employment_type === "contract" ? "contract" : "permanent",
    jobType: row.employment_type === "contract" ? "contract" : "permanent",
    salaryMin: row.salary_min ?? undefined,
    salaryMax: row.salary_max ?? undefined,
    feeType: row.fee_type ?? undefined,
    feePct: row.fee_pct ?? undefined,
    priority: (row.priority ?? "medium") as Job["priority"],
    status: (row.status ?? "active") as JobStatus,
    headcount: row.headcount ?? 1,
    portalVisible: row.portal_visible ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyName: row.companies?.name,
  };
}

// ─── useCandidates ────────────────────────────────────────────────────────────

interface UseCandidatesReturn {
  candidates: Candidate[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Total rows matched before pagination (null while loading). */
  total: number | null;
  addCandidate: (data: NewCandidateInput) => Promise<Candidate | null>;
  bulkAddCandidates: (data: NewCandidateInput[]) => Promise<number>;
}

/**
 * US-305: pagination options. The default 2000-row safety cap keeps very
 * large agencies from blowing through memory on hook mount — this was an
 * unbounded scan before. List views that need explicit paging pass
 * { limit, offset } and use the returned `total` to drive pagination UI.
 *
 * A follow-up story will push the candidates page onto server-side filter
 * + keyset pagination; until then the cap is generous enough to cover the
 * overwhelming majority of agencies.
 */
export interface UseCandidatesOptions {
  limit?:  number;   // default 2000
  offset?: number;   // default 0
}

const DEFAULT_CANDIDATE_PAGE_SIZE = 2000;

export interface NewCandidateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  source?: string;
  skills?: string[];
  linkedinUrl?: string;
  agencyId?: string;
}

export function useCandidates(opts?: UseCandidatesOptions): UseCandidatesReturn {
  const queryClient = useQueryClient();

  // US-305: bounded range — default 500 rows/page prevents unbounded scans.
  const limit  = opts?.limit  ?? DEFAULT_CANDIDATE_PAGE_SIZE;
  const offset = opts?.offset ?? 0;

  const {
    data,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["candidates", limit, offset],
    queryFn: async () => {
      const supabase = createClient();
      // Explicit column list (not *) reduces wire payload (US-305)
      // Bounded range + count=exact so UI can show "X of Y" pagination controls
      const { data: rows, error: err, count } = await supabase
        .from("candidates")
        .select(`
          id, first_name, last_name, email, phone,
          current_title, current_company, location,
          status, source, skills, linkedin_url, avatar_url,
          salary_min, salary_max, availability, notes,
          tags, custom_fields, last_activity_at,
          created_at, updated_at
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (err) throw new Error(err.message);
      return {
        candidates: (rows ?? []).map(mapCandidate),
        total: count ?? null,
      };
    },
    staleTime: 30_000,
  });

  const candidates = data?.candidates ?? [];
  const total      = data?.total ?? null;
  const error      = queryError ? (queryError as Error).message : null;

  async function addCandidate(input: NewCandidateInput): Promise<Candidate | null> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const agencyId = input.agencyId ?? ctx.agencyId;

    const { data, error: err } = await supabase
      .from("candidates")
      .insert({
        agency_id:       agencyId,
        first_name:      input.firstName,
        last_name:       input.lastName,
        email:           input.email,
        phone:           input.phone,
        current_title:   input.currentTitle,
        current_company: input.currentCompany,
        location:        input.location,
        source:          input.source,
        skills:          input.skills ?? [],
        linkedin_url:    input.linkedinUrl,
      })
      .select()
      .single();

    if (err || !data) { console.error(err); return null; }
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    return mapCandidate(data);
  }

  /** Bulk-insert multiple candidates. Returns the number successfully inserted. */
  async function bulkAddCandidates(inputs: NewCandidateInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return 0;

    const rows = inputs.map((input) => ({
      agency_id:       ctx.agencyId,
      first_name:      input.firstName,
      last_name:       input.lastName,
      email:           input.email,
      phone:           input.phone,
      current_title:   input.currentTitle,
      current_company: input.currentCompany,
      location:        input.location,
      source:          input.source ?? "import",
      skills:          input.skills ?? [],
      linkedin_url:    input.linkedinUrl,
    }));

    const { data, error: err } = await supabase
      .from("candidates")
      .insert(rows)
      .select();

    if (err) { console.error(err); return 0; }
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    return (data ?? []).length;
  }

  return { candidates, total, loading, error, refresh: () => { refetch(); }, addCandidate, bulkAddCandidates };
}

// ─── useJobs ──────────────────────────────────────────────────────────────────

interface UseJobsReturn {
  jobs: (Job & { companyName?: string; candidateCount?: number })[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  addJob: (data: NewJobInput) => Promise<string | null>;
}

export interface NewJobInput {
  title: string;
  companyId?: string;
  location?: string;
  remotePolicy?: string;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  feeType?: string;
  feePct?: number;
  priority?: string;
  headcount?: number;
  description?: string;
}

export function useJobs(): UseJobsReturn {
  const queryClient = useQueryClient();

  const {
    data: jobs = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const supabase = createClient();
      // Single query — embedded count eliminates the separate pipeline_entries scan (US-304)
      const { data, error: err } = await supabase
        .from("jobs")
        .select(`*, companies(id, name, portal_slug), candidate_pipeline_entries(count)`)
        .order("created_at", { ascending: false });
      if (err) throw new Error(err.message);
      return (data ?? []).map((row) => ({
        ...mapJob(row),
        candidateCount: Number((row as any).candidate_pipeline_entries?.[0]?.count ?? 0),
      }));
    },
    staleTime: 30_000,
  });

  const error = queryError ? (queryError as Error).message : null;

  async function addJob(input: NewJobInput): Promise<string | null> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const { data, error: err } = await supabase
      .from("jobs")
      .insert({
        agency_id:       ctx.agencyId,
        company_id:      input.companyId,
        title:           input.title,
        location:        input.location,
        remote_policy:   input.remotePolicy ?? "onsite",
        employment_type: input.employmentType ?? "full_time",
        salary_min:      input.salaryMin,
        salary_max:      input.salaryMax,
        fee_type:        input.feeType ?? "contingency",
        fee_pct:         input.feePct,
        priority:        input.priority ?? "medium",
        headcount:       input.headcount ?? 1,
        description:     input.description,
        status:          "active",
      })
      .select(`*, companies(id, name, portal_slug)`)
      .single();

    if (err || !data) { console.error(err); return null; }

    // Auto-create default pipeline stages for this job
    const defaultStages = [
      { name: "Applied",     client_name: "Applied",           color: "#94A3B8", position: 1 },
      { name: "Phone Screen",client_name: "Phone Screen",      color: "#60A5FA", position: 2 },
      { name: "Technical",   client_name: "Technical Interview",color: "#818CF8", position: 3 },
      { name: "Final Round", client_name: "Final Round",       color: "#F59E0B", position: 4 },
      { name: "Offer",       client_name: "Offer Extended",    color: "#10B981", position: 5 },
      { name: "Placed",      client_name: "Placed",            color: "#059669", position: 6 },
    ];

    await supabase.from("pipeline_stages").insert(
      defaultStages.map((s) => ({
        agency_id: ctx.agencyId,
        job_id: data.id,
        ...s,
        is_default: true,
      }))
    );

    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    return data.id;
  }

  return { jobs, loading, error, refresh: () => { refetch(); }, addJob };
}

// ─── useCompanies ─────────────────────────────────────────────────────────────

export interface DbCompany {
  id: string;
  name: string;
  industry?: string;
  size?: string;
  website?: string;
  contract_status: string;
  arr?: number;
  portal_slug?: string;
  logo_url?: string;
  isArchived?: boolean;
}

export interface NewCompanyInput {
  name: string;
  industry?: string;
  website?: string;
  size?: string;
  arr?: number;
  contractStatus?: string;
}

export function useCompanies() {
  const queryClient = useQueryClient();

  const {
    data: companies = [],
    isLoading: loading,
  } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("companies")
        .select("id, name, industry, size, website, contract_status, arr, portal_slug, logo_url")
        .order("name");
      return (data ?? []) as DbCompany[];
    },
    staleTime: 30_000,
  });

  async function addCompany(input: NewCompanyInput): Promise<DbCompany | null> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    // Generate a URL-safe portal slug from the company name
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) + "-" + Math.random().toString(36).slice(2, 7);

    const { data, error } = await supabase
      .from("companies")
      .insert({
        agency_id:       ctx.agencyId,
        name:            input.name.trim(),
        industry:        input.industry ?? null,
        website:         input.website ?? null,
        size:            input.size ?? null,
        arr:             input.arr ?? null,
        portal_slug:     slug,
        contract_status: input.contractStatus ?? "prospect",
      })
      .select("id, name, industry, size, website, contract_status, arr, portal_slug, logo_url")
      .single();

    if (error || !data) { console.error(error); return null; }
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    return data as DbCompany;
  }

  return { companies, loading, addCompany };
}

// ─── Scoped company/job/placement lookups (US-316) ───────────────────────────
// Replace the "fetch-all-then-find" pattern used by detail pages. Each hook
// fetches exactly one record set via a single .eq() query instead of pulling
// the whole table into the client.

/** Single company by ID — returns null until the row loads. */
export function useCompany(id: string | undefined) {
  const { data: company = null, isLoading: loading } = useQuery({
    queryKey: ["company", id ?? null],
    queryFn: async () => {
      if (!id) return null;
      const supabase = createClient();
      const { data } = await supabase
        .from("companies")
        .select("id, name, industry, size, website, contract_status, arr, portal_slug, logo_url")
        .eq("id", id)
        .maybeSingle();
      return (data ?? null) as DbCompany | null;
    },
    staleTime: 30_000,
    enabled: !!id,
  });
  return { company, loading };
}

/** Jobs for a specific client — replaces useJobs().filter(j => j.clientId === x). */
export function useJobsByClient(clientId: string | undefined) {
  const { data: jobs = [], isLoading: loading } = useQuery({
    queryKey: ["jobs", "by-client", clientId ?? null],
    queryFn: async () => {
      if (!clientId) return [];
      const supabase = createClient();
      const { data } = await supabase
        .from("jobs")
        .select(`*, companies(id, name, portal_slug), candidate_pipeline_entries(count)`)
        .eq("company_id", clientId)
        .order("created_at", { ascending: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        ...mapJob(row),
        candidateCount: Number(row.candidate_pipeline_entries?.[0]?.count ?? 0),
      }));
    },
    staleTime: 30_000,
    enabled: !!clientId,
  });
  return { jobs, loading };
}

/** Placements for a specific client — replaces usePlacements().filter(p => p.clientId === x). */
export function usePlacementsByClient(clientId: string | undefined) {
  const { data: placements = [], isLoading: loading } = useQuery({
    queryKey: ["placements", "by-client", clientId ?? null],
    queryFn: async (): Promise<PlacementRecord[]> => {
      if (!clientId) return [];
      const supabase = createClient();
      const { data } = await supabase
        .from("placements")
        .select(`
          id, candidate_id, job_id, start_date, placed_at,
          fee_amount, currency, fee_type, fee_percentage,
          invoice_status, invoiced_at, invoice_number, amount_collected,
          candidates(first_name, last_name, current_title),
          jobs!inner(title, company_id, companies(id, name)),
          users(full_name)
        `)
        .eq("jobs.company_id", clientId)
        .order("placed_at", { ascending: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        id:              row.id,
        candidateId:     row.candidate_id,
        candidateName:   `${row.candidates?.first_name ?? ""} ${row.candidates?.last_name ?? ""}`.trim(),
        candidateTitle:  row.candidates?.current_title ?? "",
        jobId:           row.job_id,
        jobTitle:        row.jobs?.title ?? "",
        clientName:      row.jobs?.companies?.name ?? "",
        clientId:        row.jobs?.company_id ?? "",
        startDate:       row.start_date,
        placedAt:        row.placed_at,
        feeAmount:       Number(row.fee_amount ?? 0),
        currency:        row.currency ?? "USD",
        feeType:         (row.fee_type ?? "percentage") as "percentage" | "flat",
        feePercentage:   row.fee_percentage ?? undefined,
        invoiceStatus:   (row.invoice_status ?? "pending") as PlacementRecord["invoiceStatus"],
        invoicedAt:      row.invoiced_at ?? undefined,
        invoiceNumber:   row.invoice_number ?? undefined,
        amountCollected: Number(row.amount_collected ?? 0),
        recruiterName:   row.users?.full_name ?? "",
      }));
    },
    staleTime: 30_000,
    enabled: !!clientId,
  });
  return { placements, loading };
}

// ─── useDashboardStats ────────────────────────────────────────────────────────

export interface DashboardStats {
  activeCandidates: number;
  openJobs: number;
  activeClients: number;
  pipelineEntries: number;
  placements: number;
  loading: boolean;
}

export function useDashboardStats(): DashboardStats {
  const { data, isLoading: loading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const supabase = createClient();
      const [cands, jobs, clients, pipeline, placements] = await Promise.all([
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("contract_status", "active"),
        supabase.from("candidate_pipeline_entries").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("placements").select("id", { count: "exact", head: true }),
      ]);
      return {
        activeCandidates: cands.count ?? 0,
        openJobs:         jobs.count  ?? 0,
        activeClients:    clients.count ?? 0,
        pipelineEntries:  pipeline.count ?? 0,
        placements:       placements.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  return {
    activeCandidates: data?.activeCandidates ?? 0,
    openJobs:         data?.openJobs         ?? 0,
    activeClients:    data?.activeClients    ?? 0,
    pipelineEntries:  data?.pipelineEntries  ?? 0,
    placements:       data?.placements       ?? 0,
    loading,
  };
}

// ─── usePlacements ────────────────────────────────────────────────────────────

export interface PlacementRecord {
  id: string;
  candidateName: string;
  candidateId: string;
  candidateTitle: string;
  jobTitle: string;
  jobId: string;
  clientName: string;
  clientId: string;
  startDate?: string;
  placedAt: string;
  createdAt?: string;
  feeAmount: number;
  currency: string;
  feeType: "percentage" | "flat";
  feePercentage?: number;
  invoiceStatus: "pending" | "invoiced" | "partial" | "paid";
  invoicedAt?: string;
  invoiceNumber?: string;
  amountCollected: number;
  recruiterName: string;
}

export function usePlacements() {
  const [placements, setPlacements] = useState<PlacementRecord[]>([]);
  const [loading, setLoading]       = useState(true);

  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("placements")
      .select(`
        id, candidate_id, job_id, start_date, placed_at,
        fee_amount, currency, fee_type, fee_percentage,
        invoice_status, invoiced_at, invoice_number, amount_collected,
        candidates(first_name, last_name, current_title),
        jobs(title, company_id, companies(id, name)),
        users(full_name)
      `)
      .order("placed_at", { ascending: false });

    if (!error && data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPlacements((data as any[]).map((r): PlacementRecord => ({
        id:              r.id,
        candidateId:     r.candidate_id,
        candidateName:   r.candidates ? `${r.candidates.first_name} ${r.candidates.last_name}` : "Unknown",
        candidateTitle:  r.candidates?.current_title ?? "",
        jobTitle:        r.jobs?.title ?? "Unknown",
        jobId:           r.job_id,
        clientName:      r.jobs?.companies?.name ?? "Unknown",
        clientId:        r.jobs?.company_id ?? "",
        startDate:       r.start_date ?? undefined,
        placedAt:        r.placed_at,
        feeAmount:       r.fee_amount ?? 0,
        currency:        r.currency ?? "USD",
        feeType:         r.fee_type === "flat" ? "flat" : "percentage",
        feePercentage:   r.fee_percentage ?? undefined,
        invoiceStatus:   (r.invoice_status ?? "pending") as PlacementRecord["invoiceStatus"],
        invoicedAt:      r.invoiced_at ?? undefined,
        invoiceNumber:   r.invoice_number ?? undefined,
        amountCollected: r.amount_collected ?? 0,
        recruiterName:   r.users?.full_name ?? "—",
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlacements(); }, [fetchPlacements]);

  async function markInvoiced(id: string, invoiceNumber: string, invoicedAt: string) {
    const supabase = createClient();
    await supabase
      .from("placements")
      .update({ invoice_status: "invoiced", invoice_number: invoiceNumber, invoiced_at: invoicedAt })
      .eq("id", id);
    setPlacements((prev) =>
      prev.map((p) => p.id === id
        ? { ...p, invoiceStatus: "invoiced", invoiceNumber, invoicedAt }
        : p
      )
    );
  }

  async function logPayment(id: string, additionalAmount: number) {
    const placement = placements.find((p) => p.id === id);
    if (!placement) return;
    const newCollected = Math.min(placement.amountCollected + additionalAmount, placement.feeAmount);
    const newStatus: PlacementRecord["invoiceStatus"] = newCollected >= placement.feeAmount ? "paid" : "partial";
    const supabase = createClient();
    await supabase
      .from("placements")
      .update({ invoice_status: newStatus, amount_collected: newCollected })
      .eq("id", id);
    setPlacements((prev) =>
      prev.map((p) => p.id === id
        ? { ...p, amountCollected: newCollected, invoiceStatus: newStatus }
        : p
      )
    );
  }

  return { placements, loading, refresh: fetchPlacements, markInvoiced, logPayment };
}

// ─── useTasks ─────────────────────────────────────────────────────────────────

export type TaskEntityType = "candidate" | "job" | "client";
export type TaskPriority   = "high" | "medium" | "low";
export type TaskStatus     = "open" | "done";

export interface TaskRecord {
  id:           string;
  entityType:   TaskEntityType;
  entityId:     string;
  title:        string;
  priority:     TaskPriority;
  status:       TaskStatus;
  dueDate?:     string;
  completedAt?: string;
  assigneeId?:  string;
  assigneeName?: string;
  createdAt:    string;
}

export interface NewTaskInput {
  entityType:  TaskEntityType;
  entityId:    string;
  title:       string;
  priority?:   TaskPriority;
  dueDate?:    string;
  assigneeId?: string;
}

export function useTasks(entityId: string, entityType: TaskEntityType) {
  const [tasks, setTasks]   = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId) return;
    const supabase = createClient();
    supabase
      .from("tasks")
      .select("*, users!assignee_id(full_name)")
      .eq("entity_id", entityId)
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTasks((data ?? []).map((r: any): TaskRecord => ({
          id:           r.id,
          entityType:   r.entity_type as TaskEntityType,
          entityId:     r.entity_id,
          title:        r.title,
          priority:     r.priority as TaskPriority,
          status:       r.status as TaskStatus,
          dueDate:      r.due_date ?? undefined,
          completedAt:  r.completed_at ?? undefined,
          assigneeId:   r.assignee_id ?? undefined,
          assigneeName: r.users?.full_name ?? undefined,
          createdAt:    r.created_at,
        })));
        setLoading(false);
      });
  }, [entityId, entityType]);

  async function addTask(input: Pick<NewTaskInput, "title" | "priority" | "dueDate">): Promise<TaskRecord | null> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        agency_id:   ctx.agencyId,
        created_by:  ctx.userId,
        entity_type: entityType,
        entity_id:   entityId,
        title:       input.title,
        priority:    input.priority ?? "medium",
        status:      "open",
        due_date:    input.dueDate ?? null,
      })
      .select("*, users!assignee_id(full_name)")
      .single();

    if (error || !data) { console.error(error); return null; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    const task: TaskRecord = {
      id:          r.id,
      entityType:  r.entity_type as TaskEntityType,
      entityId:    r.entity_id,
      title:       r.title,
      priority:    r.priority as TaskPriority,
      status:      "open",
      dueDate:     r.due_date ?? undefined,
      createdAt:   r.created_at,
    };
    setTasks((prev) => [task, ...prev]);
    return task;
  }

  async function toggleTask(id: string): Promise<void> {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const newStatus: TaskStatus = task.status === "open" ? "done" : "open";
    const supabase = createClient();
    await supabase
      .from("tasks")
      .update({
        status:       newStatus,
        completed_at: newStatus === "done" ? new Date().toISOString() : null,
        updated_at:   new Date().toISOString(),
      })
      .eq("id", id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));
  }

  async function deleteTask(id: string): Promise<void> {
    const supabase = createClient();
    await supabase.from("tasks").delete().eq("id", id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return { tasks, loading, addTask, toggleTask, deleteTask };
}

// ─── useActivities ────────────────────────────────────────────────────────────

export type ActivityEntityType = "candidate" | "job" | "client";
export type ActivityActionType =
  | "note" | "call" | "email"
  | "stage_change" | "submission" | "placement"
  | "client_feedback" | "task_created" | "task_completed";

export interface ActivityRecord {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  actorId: string | null;
  actorName: string;
  action: ActivityActionType;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function useActivities(entityId: string, entityType: ActivityEntityType = "candidate") {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading]       = useState(true);

  const fetchActivities = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("activities")
      .select("id, actor_id, entity_type, entity_id, action, metadata, created_at, users(full_name)")
      .eq("entity_id", entityId)
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setActivities((data ?? []).map((r: any): ActivityRecord => ({
      id:         r.id,
      entityType: r.entity_type as ActivityEntityType,
      entityId:   r.entity_id,
      actorId:    r.actor_id ?? null,
      actorName:  r.users?.full_name ?? "System",
      action:     r.action as ActivityActionType,
      summary:    (r.metadata as Record<string, unknown>)?.summary as string ?? r.action,
      metadata:   (r.metadata as Record<string, unknown>) ?? {},
      createdAt:  r.created_at,
    })));
    setLoading(false);
  }, [entityId, entityType]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  async function addActivity(
    action: ActivityActionType,
    summary: string,
    metadata: Record<string, unknown> = {}
  ): Promise<ActivityRecord | null> {
    if (!entityId) return null;
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const { data, error } = await supabase
      .from("activities")
      .insert({
        agency_id:   ctx.agencyId,
        actor_id:    ctx.userId,
        entity_type: entityType,
        entity_id:   entityId,
        action,
        metadata:    { ...metadata, summary },
      })
      .select("id, actor_id, entity_type, entity_id, action, metadata, created_at")
      .single();

    if (error || !data) { console.error(error); return null; }

    const record: ActivityRecord = {
      id:         data.id,
      entityType: data.entity_type as ActivityEntityType,
      entityId:   data.entity_id,
      actorId:    data.actor_id ?? null,
      actorName:  "Me",
      action:     data.action as ActivityActionType,
      summary,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata:   (data.metadata as any) ?? {},
      createdAt:  data.created_at,
    };
    setActivities((prev) => [record, ...prev]);
    return record;
  }

  return { activities, loading, addActivity, refresh: fetchActivities };
}

// ─── useRecentActivities ──────────────────────────────────────────────────────
// Fetches the most recent activities across ALL entities for the agency feed.

export function useRecentActivities(limit = 20) {
  const queryClient = useQueryClient();

  const { data: activities = [], isLoading: loading } = useQuery({
    queryKey: ["activities", limit],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("activities")
        .select("id, actor_id, entity_type, entity_id, action, metadata, created_at, users(full_name)")
        .order("created_at", { ascending: false })
        .limit(limit);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any): ActivityRecord => ({
        id:         r.id,
        entityType: r.entity_type as ActivityEntityType,
        entityId:   r.entity_id,
        actorId:    r.actor_id ?? null,
        actorName:  r.users?.full_name ?? "System",
        action:     r.action as ActivityActionType,
        summary:    (r.metadata as Record<string, unknown>)?.summary as string ?? r.action,
        metadata:   (r.metadata as Record<string, unknown>) ?? {},
        createdAt:  r.created_at,
      }));
    },
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["activities", limit] });

  return { activities, loading, refresh };
}

// ─── useSavedSearches — placeholder until second definition below ─────────────

// ─── useWorkHistory ───────────────────────────────────────────────────────────

export interface WorkHistoryRecord {
  id: string;
  candidateId: string;
  company: string;
  title: string;
  startDate: string;   // YYYY-MM
  endDate: string | null;
  location: string | null;
  bullets: string[];
  position: number;
  createdAt: string;
}

export interface NewWorkHistoryInput {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  location?: string;
  bullets?: string[];
  position?: number;
}

export function useWorkHistory(candidateId: string) {
  const [workHistory, setWorkHistory] = useState<WorkHistoryRecord[]>([]);
  const [loading, setLoading]         = useState(true);

  const fetch = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("work_history")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("position", { ascending: true })
      .order("start_date", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setWorkHistory((data ?? []).map((r: any): WorkHistoryRecord => ({
      id:          r.id,
      candidateId: r.candidate_id,
      company:     r.company,
      title:       r.title,
      startDate:   r.start_date,
      endDate:     r.end_date ?? null,
      location:    r.location ?? null,
      bullets:     (r.bullets as string[]) ?? [],
      position:    r.position ?? 0,
      createdAt:   r.created_at,
    })));
    setLoading(false);
  }, [candidateId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function addWork(input: NewWorkHistoryInput): Promise<WorkHistoryRecord | null> {
    if (!candidateId) return null;
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const { data, error } = await supabase
      .from("work_history")
      .insert({
        agency_id:    ctx.agencyId,
        candidate_id: candidateId,
        company:      input.company,
        title:        input.title,
        start_date:   input.startDate,
        end_date:     input.endDate ?? null,
        location:     input.location ?? null,
        bullets:      input.bullets ?? [],
        position:     input.position ?? 0,
      })
      .select("*")
      .single();

    if (error || !data) { console.error(error); return null; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record: WorkHistoryRecord = {
      id: data.id, candidateId: data.candidate_id, company: data.company, title: data.title,
      startDate: data.start_date, endDate: data.end_date ?? null, location: data.location ?? null,
      bullets: (data.bullets as string[]) ?? [], position: data.position ?? 0, createdAt: data.created_at,
    };
    setWorkHistory((prev) => [...prev, record].sort((a, b) => a.position - b.position));
    return record;
  }

  async function deleteWork(id: string): Promise<void> {
    const supabase = createClient();
    await supabase.from("work_history").delete().eq("id", id);
    setWorkHistory((prev) => prev.filter((r) => r.id !== id));
  }

  return { workHistory, loading, addWork, deleteWork, refresh: fetch };
}

// ─── useEducation ─────────────────────────────────────────────────────────────

export interface EducationRecord {
  id: string;
  candidateId: string;
  school: string;
  degree: string;
  field: string;
  gradYear: string;
  position: number;
  createdAt: string;
}

export interface NewEducationInput {
  school: string;
  degree: string;
  field: string;
  gradYear: string;
  position?: number;
}

export function useEducation(candidateId: string) {
  const [educationList, setEducationList] = useState<EducationRecord[]>([]);
  const [loading, setLoading]             = useState(true);

  const fetch = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("education")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("position", { ascending: true })
      .order("grad_year",  { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEducationList((data ?? []).map((r: any): EducationRecord => ({
      id:          r.id,
      candidateId: r.candidate_id,
      school:      r.school,
      degree:      r.degree,
      field:       r.field,
      gradYear:    r.grad_year,
      position:    r.position ?? 0,
      createdAt:   r.created_at,
    })));
    setLoading(false);
  }, [candidateId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function addEducation(input: NewEducationInput): Promise<EducationRecord | null> {
    if (!candidateId) return null;
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const { data, error } = await supabase
      .from("education")
      .insert({
        agency_id:    ctx.agencyId,
        candidate_id: candidateId,
        school:       input.school,
        degree:       input.degree,
        field:        input.field,
        grad_year:    input.gradYear,
        position:     input.position ?? 0,
      })
      .select("*")
      .single();

    if (error || !data) { console.error(error); return null; }
    const record: EducationRecord = {
      id: data.id, candidateId: data.candidate_id, school: data.school,
      degree: data.degree, field: data.field, gradYear: data.grad_year,
      position: data.position ?? 0, createdAt: data.created_at,
    };
    setEducationList((prev) => [...prev, record].sort((a, b) => a.position - b.position));
    return record;
  }

  async function deleteEducation(id: string): Promise<void> {
    const supabase = createClient();
    await supabase.from("education").delete().eq("id", id);
    setEducationList((prev) => prev.filter((r) => r.id !== id));
  }

  return { educationList, loading, addEducation, deleteEducation, refresh: fetch };
}

// ─── useCandidate (single record) ─────────────────────────────────────────────

export function useCandidate(id: string) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase
      .from("candidates")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); }
        else { setCandidate(mapCandidate(data)); }
        setLoading(false);
      });
  }, [id]);

  return { candidate, loading, notFound };
}

// ─── useJob (single record + pipeline stages + entries) ───────────────────────

export interface PipelineEntry {
  id: string;
  candidateId: string;
  stageId: string;
  status: string;
  enteredStageAt: string;
  candidate?: Candidate;
}

export interface PipelineStageDb {
  id: string;
  name: string;
  clientName?: string;
  position: number;
  color: string;
  slaDays?: number;
}

export function useJob(id: string) {
  const [job, setJob]         = useState<(Job & { companyName?: string }) | null>(null);
  const [stages, setStages]   = useState<PipelineStageDb[]>([]);
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchJob = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const supabase = createClient();

    const [jobRes, stagesRes, entriesRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("*, companies(id, name, portal_slug)")
        .eq("id", id)
        .single(),
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("job_id", id)
        .order("position"),
      supabase
        .from("candidate_pipeline_entries")
        .select("*, candidates(id, first_name, last_name, email, current_title, current_company, location, skills, status)")
        .eq("job_id", id)
        .eq("status", "active"),
    ]);

    if (jobRes.error || !jobRes.data) { setNotFound(true); setLoading(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setJob(mapJob(jobRes.data) as any);
    setStages((stagesRes.data ?? []).map((s) => ({
      id:         s.id,
      name:       s.name,
      clientName: s.client_name,
      position:   s.position,
      color:      s.color,
      slaDays:    s.sla_days,
    })));
    setEntries((entriesRes.data ?? []).map((e) => ({
      id:             e.id,
      candidateId:    e.candidate_id,
      stageId:        e.stage_id,
      status:         e.status,
      enteredStageAt: e.entered_stage_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidate:      e.candidates ? mapCandidate(e.candidates as any) : undefined,
    })));
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  async function moveEntry(entryId: string, newStageId: string) {
    const supabase = createClient();
    await supabase
      .from("candidate_pipeline_entries")
      .update({ stage_id: newStageId, entered_stage_at: new Date().toISOString() })
      .eq("id", entryId);
    setEntries((prev) =>
      prev.map((e) => e.id === entryId ? { ...e, stageId: newStageId, enteredStageAt: new Date().toISOString() } : e)
    );
  }

  async function addEntry(candidateId: string, stageId: string): Promise<PipelineEntry | null> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const { data, error } = await supabase
      .from("candidate_pipeline_entries")
      .insert({
        agency_id:        ctx.agencyId,
        job_id:           id,
        candidate_id:     candidateId,
        stage_id:         stageId,
        status:           "active",
        entered_stage_at: new Date().toISOString(),
      })
      .select("*, candidates(id, first_name, last_name, email, current_title, current_company, location, skills, status)")
      .single();

    if (error || !data) { console.error(error); return null; }

    const entry: PipelineEntry = {
      id:             data.id,
      candidateId:    data.candidate_id,
      stageId:        data.stage_id,
      status:         data.status,
      enteredStageAt: data.entered_stage_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidate:      data.candidates ? mapCandidate(data.candidates as any) : undefined,
    };
    setEntries((prev) => [...prev, entry]);
    return entry;
  }

  // ── Stage management ──────────────────────────────────────────────────────

  async function addStage(name: string, color = "#94a3b8", clientName?: string): Promise<PipelineStageDb | null> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const nextPosition = stages.length > 0
      ? Math.max(...stages.map((s) => s.position)) + 1
      : 1;

    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        agency_id:   ctx.agencyId,
        job_id:      id,
        name,
        client_name: clientName ?? name,
        color,
        position:    nextPosition,
        is_default:  false,
      })
      .select()
      .single();

    if (error || !data) { console.error(error); return null; }

    const stage: PipelineStageDb = {
      id:         data.id,
      name:       data.name,
      clientName: data.client_name ?? undefined,
      position:   data.position,
      color:      data.color ?? "#94a3b8",
      slaDays:    data.sla_days ?? undefined,
    };
    setStages((prev) => [...prev, stage]);
    return stage;
  }

  async function updateStage(
    stageId: string,
    patch: Partial<Pick<PipelineStageDb, "name" | "color" | "slaDays" | "clientName">>
  ): Promise<boolean> {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};
    if (patch.name       !== undefined) update.name        = patch.name;
    if (patch.color      !== undefined) update.color       = patch.color;
    if (patch.slaDays    !== undefined) update.sla_days    = patch.slaDays ?? null;
    if (patch.clientName !== undefined) update.client_name = patch.clientName;

    const { error } = await supabase.from("pipeline_stages").update(update).eq("id", stageId);
    if (error) { console.error(error); return false; }

    setStages((prev) => prev.map((s) => s.id === stageId ? { ...s, ...patch } : s));
    return true;
  }

  async function deleteStage(stageId: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) { console.error(error); return false; }
    setStages((prev) => prev.filter((s) => s.id !== stageId));
    return true;
  }

  async function reorderStages(orderedIds: string[]): Promise<void> {
    const supabase = createClient();
    // Optimistic update first
    setStages((prev) => {
      const byId: Record<string, PipelineStageDb> = {};
      prev.forEach((s) => { byId[s.id] = s; });
      return orderedIds
        .map((sid, idx) => byId[sid] ? { ...byId[sid], position: idx + 1 } : null)
        .filter(Boolean) as PipelineStageDb[];
    });
    // Persist each position
    await Promise.all(
      orderedIds.map((sid, idx) =>
        supabase.from("pipeline_stages").update({ position: idx + 1 }).eq("id", sid)
      )
    );
  }

  async function resetToDefaultStages(): Promise<void> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;

    // Delete all existing stages for this job
    await supabase.from("pipeline_stages").delete().eq("job_id", id);

    const defaults = [
      { name: "Applied",      client_name: "Applied",            color: "#94A3B8", position: 1 },
      { name: "Phone Screen", client_name: "Phone Screen",       color: "#60A5FA", position: 2 },
      { name: "Technical",    client_name: "Technical Interview", color: "#818CF8", position: 3 },
      { name: "Final Round",  client_name: "Final Round",        color: "#F59E0B", position: 4 },
      { name: "Offer",        client_name: "Offer Extended",     color: "#10B981", position: 5 },
      { name: "Placed",       client_name: "Placed",             color: "#059669", position: 6 },
    ];

    const { data } = await supabase
      .from("pipeline_stages")
      .insert(defaults.map((s) => ({ ...s, agency_id: ctx.agencyId, job_id: id, is_default: true })))
      .select();

    if (data) {
      setStages(data.map((s) => ({
        id:         s.id,
        name:       s.name,
        clientName: s.client_name ?? undefined,
        position:   s.position,
        color:      s.color ?? "#94a3b8",
        slaDays:    s.sla_days ?? undefined,
      })));
    }
  }

  return {
    job, stages, entries, loading, notFound,
    refresh: fetchJob,
    moveEntry, addEntry,
    addStage, updateStage, deleteStage, reorderStages, resetToDefaultStages,
  };
}

// ─── useInterviewPlan ─────────────────────────────────────────────────────────
//
// Loads and persists the per-job interview plan.
// One row per job in `job_interview_plans`; stages stored as JSONB array.

export interface InterviewStageRecord {
  id: string;
  name: string;
  format: "phone" | "video" | "onsite" | "panel" | "assessment" | "executive";
  durationMins: number;
  ownerId?: string;
  description?: string;
  scorecardRequired: boolean;
  schedulingUrl?: string;
}

export interface InterviewPlanRecord {
  jobId: string;
  stages: InterviewStageRecord[];
  notes?: string;
}

export function useInterviewPlan(jobId: string) {
  const [plan, setPlan]       = useState<InterviewPlanRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) { setLoading(false); return; }
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("job_interview_plans")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      if (data) {
        setPlan({
          jobId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stages: (data.stages as any[]) ?? [],
          notes:  data.notes ?? undefined,
        });
      }
      setLoading(false);
    };
    load();
  }, [jobId]);

  async function savePlan(incoming: InterviewPlanRecord): Promise<boolean> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: userRow } = await supabase
      .from("users")
      .select("agency_id")
      .eq("id", user.id)
      .single();
    if (!userRow?.agency_id) return false;

    const { error } = await supabase
      .from("job_interview_plans")
      .upsert(
        {
          agency_id:  userRow.agency_id,
          job_id:     jobId,
          stages:     incoming.stages,
          notes:      incoming.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_id" }
      );

    if (error) { console.error(error); return false; }
    setPlan(incoming);
    return true;
  }

  async function deletePlan(): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from("job_interview_plans")
      .delete()
      .eq("job_id", jobId);
    if (error) { console.error(error); return false; }
    setPlan(null);
    return true;
  }

  return { plan, loading, savePlan, deletePlan };
}

// ─── usePortalCompany (public — lookup by portal_slug, no RLS) ───────────────

export type PortalDecision = "advance" | "hold" | "pass";

export interface PortalSubmission {
  id: string;
  candidateId: string;
  stageId: string;
  jobId: string;
  candidate?: Candidate;
  stageName?: string;
  recruiterNote?: string;
  score?: number | null;
  submittedToClientAt?: string | null;
  clientDecision?: PortalDecision | null;
  clientDecisionReason?: string | null;
  clientDecisionNote?: string | null;
}

export interface PortalData {
  company: DbCompany & { portal_slug: string };
  jobs: Array<{
    id: string; title: string; location?: string; remote_policy: string;
    employment_type: string; status: string;
  }>;
  submissions: PortalSubmission[];
}

export function usePortalData(portalSlug: string) {
  const [data, setData]     = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!portalSlug) return;
    const supabase = createClient();

    // Companies are readable without auth for portal routes
    supabase
      .from("companies")
      .select("*")
      .eq("portal_slug", portalSlug)
      .single()
      .then(async ({ data: company, error }) => {
        if (error || !company) { setNotFound(true); setLoading(false); return; }

        const jobIdsRes = await supabase
          .from("jobs")
          .select("id")
          .eq("company_id", company.id);
        const jobIds = jobIdsRes.data?.map((j) => j.id) ?? [];

        const [jobsRes, submissionsRes] = await Promise.all([
          supabase
            .from("jobs")
            .select("id, title, location, remote_policy, employment_type, status")
            .eq("company_id", company.id)
            .eq("portal_visible", true),
          supabase
            .from("candidate_pipeline_entries")
            .select(`
              id, candidate_id, stage_id, job_id, status,
              recruiter_note, score, submitted_to_client_at,
              client_decision, client_decision_reason, client_decision_note,
              candidates(id, first_name, last_name, current_title, current_company, skills),
              pipeline_stages(name)
            `)
            .eq("status", "active")
            .in("job_id", jobIds),
        ]);

        setData({
          company,
          jobs: jobsRes.data ?? [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          submissions: (submissionsRes.data ?? []).map((s: any) => ({
            id:                   s.id,
            candidateId:          s.candidate_id,
            stageId:              s.stage_id,
            jobId:                s.job_id,
            candidate:            s.candidates ? mapCandidate(s.candidates) : undefined,
            stageName:            s.pipeline_stages?.name,
            recruiterNote:        s.recruiter_note ?? undefined,
            score:                s.score ?? null,
            submittedToClientAt:  s.submitted_to_client_at ?? null,
            clientDecision:       s.client_decision ?? null,
            clientDecisionReason: s.client_decision_reason ?? null,
            clientDecisionNote:   s.client_decision_note ?? null,
          })),
        });
        setLoading(false);
      });
  }, [portalSlug]);

  async function saveDecision(
    entryId: string,
    decision: PortalDecision,
    reason: string,
    note: string
  ): Promise<void> {
    const supabase = createClient();
    await supabase
      .from("candidate_pipeline_entries")
      .update({
        client_decision:        decision,
        client_decision_reason: reason,
        client_decision_note:   note || null,
      })
      .eq("id", entryId);

    // Update local state optimistically
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        submissions: prev.submissions.map((s) =>
          s.id === entryId
            ? { ...s, clientDecision: decision, clientDecisionReason: reason, clientDecisionNote: note || null }
            : s
        ),
      };
    });
  }

  return { data, loading, notFound, saveDecision };
}

// ─── useCurrentUser ───────────────────────────────────────────────────────────

export interface CurrentUser {
  id: string;
  fullName: string;
  firstName: string;
  email: string;
}

// ─── useContacts ──────────────────────────────────────────────────────────────

export interface DbContact {
  id: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
}

export interface NewContactInput {
  companyId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  linkedinUrl?: string;
  isPrimary?: boolean;
  notes?: string;
}

function mapContact(row: Record<string, unknown>): DbContact {
  return {
    id:          row.id as string,
    companyId:   row.company_id as string | null,
    firstName:   row.first_name as string,
    lastName:    row.last_name as string,
    fullName:    `${row.first_name} ${row.last_name}`.trim(),
    email:       row.email as string | null,
    phone:       row.phone as string | null,
    title:       row.title as string | null,
    linkedinUrl: row.linkedin_url as string | null,
    isPrimary:   Boolean(row.is_primary),
    notes:       row.notes as string | null,
    createdAt:   row.created_at as string,
  };
}

export function useContacts(companyId: string) {
  const [contacts, setContacts] = useState<DbContact[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    supabase
      .from("contacts")
      .select("*")
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("first_name")
      .then(({ data }) => {
        setContacts((data ?? []).map(mapContact));
        setLoading(false);
      });
  }, [companyId]);

  async function addContact(input: NewContactInput): Promise<DbContact | null> {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return null;

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        agency_id:    ctx.agencyId,
        company_id:   input.companyId,
        first_name:   input.firstName,
        last_name:    input.lastName,
        email:        input.email ?? null,
        phone:        input.phone ?? null,
        title:        input.title ?? null,
        linkedin_url: input.linkedinUrl ?? null,
        is_primary:   input.isPrimary ?? contacts.length === 0,
        notes:        input.notes ?? null,
      })
      .select("*")
      .single();

    if (error || !data) { console.error(error); return null; }
    const contact = mapContact(data as Record<string, unknown>);
    setContacts((prev) => [...prev, contact]);
    return contact;
  }

  async function updateContact(id: string, patch: Partial<Omit<NewContactInput, "companyId">>): Promise<void> {
    const supabase = createClient();
    const updates: Record<string, unknown> = {};
    if (patch.firstName   !== undefined) updates.first_name   = patch.firstName;
    if (patch.lastName    !== undefined) updates.last_name    = patch.lastName;
    if (patch.email       !== undefined) updates.email        = patch.email;
    if (patch.phone       !== undefined) updates.phone        = patch.phone;
    if (patch.title       !== undefined) updates.title        = patch.title;
    if (patch.linkedinUrl !== undefined) updates.linkedin_url = patch.linkedinUrl;
    if (patch.isPrimary   !== undefined) updates.is_primary   = patch.isPrimary;
    if (patch.notes       !== undefined) updates.notes        = patch.notes;

    const { error } = await supabase.from("contacts").update(updates).eq("id", id);
    if (!error) {
      setContacts((prev) => prev.map((c) => {
        if (c.id !== id) return c;
        const fn = patch.firstName ?? c.firstName;
        const ln = patch.lastName  ?? c.lastName;
        return {
          ...c,
          firstName:   fn,
          lastName:    ln,
          fullName:    `${fn} ${ln}`.trim(),
          email:       patch.email       !== undefined ? (patch.email ?? null)       : c.email,
          phone:       patch.phone       !== undefined ? (patch.phone ?? null)       : c.phone,
          title:       patch.title       !== undefined ? (patch.title ?? null)       : c.title,
          linkedinUrl: patch.linkedinUrl !== undefined ? (patch.linkedinUrl ?? null) : c.linkedinUrl,
          isPrimary:   patch.isPrimary   ?? c.isPrimary,
          notes:       patch.notes       !== undefined ? (patch.notes ?? null)       : c.notes,
        };
      }));
    }
  }

  return { contacts, loading, addContact, updateContact };
}

export function useCurrentUser() {
  const { data: user = null, isLoading: loading } = useQuery({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;
      const { data } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", authUser.id)
        .single();
      const fullName = data?.full_name ?? authUser.email ?? "";
      return {
        id:        authUser.id,
        fullName,
        firstName: fullName.split(" ")[0] || "there",
        email:     authUser.email ?? "",
      };
    },
    staleTime: 60_000,
  });

  return { user, loading };
}

// ─── useProviderConnections ───────────────────────────────────────────────────

export type EmailProvider = "google" | "microsoft";

export interface ProviderConnectionRecord {
  id: string;
  provider: EmailProvider;
  email: string;
  syncEnabled: boolean;
  backfillCompletedAt: string | null;
  createdAt: string;
}

export function useProviderConnections() {
  const [connections, setConnections] = useState<ProviderConnectionRecord[]>([]);
  const [loading, setLoading]         = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("provider_connections")
      .select("id, provider, email, sync_enabled, backfill_completed_at, created_at")
      .order("created_at");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConnections((data ?? []).map((r: any): ProviderConnectionRecord => ({
      id:                  r.id,
      provider:            r.provider as EmailProvider,
      email:               r.email,
      syncEnabled:         r.sync_enabled,
      backfillCompletedAt: r.backfill_completed_at ?? null,
      createdAt:           r.created_at,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  async function disconnect(id: string): Promise<void> {
    const supabase = createClient();
    await supabase.from("provider_connections").delete().eq("id", id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  function isConnected(provider: EmailProvider): boolean {
    return connections.some((c) => c.provider === provider);
  }

  function getConnection(provider: EmailProvider): ProviderConnectionRecord | undefined {
    return connections.find((c) => c.provider === provider);
  }

  return { connections, loading, disconnect, isConnected, getConnection, refresh: fetch };
}

// ─── useEmailThreads ──────────────────────────────────────────────────────────

export interface EmailThreadRecord {
  id: string;
  providerThreadId: string;
  subject: string | null;
  participantCount: number;
  lastMsgAt: string;
  firstMsgAt: string;
  snippet: string | null;
  createdAt: string;
}

export function useEmailThreads(limit = 50) {
  const [threads, setThreads] = useState<EmailThreadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("email_threads")
      .select("id, provider_thread_id, subject, participant_count, last_msg_at, first_msg_at, snippet, created_at")
      .order("last_msg_at", { ascending: false })
      .limit(limit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setThreads((data ?? []).map((r: any): EmailThreadRecord => ({
      id:               r.id,
      providerThreadId: r.provider_thread_id,
      subject:          r.subject ?? null,
      participantCount: r.participant_count ?? 0,
      lastMsgAt:        r.last_msg_at,
      firstMsgAt:       r.first_msg_at,
      snippet:          r.snippet ?? null,
      createdAt:        r.created_at,
    })));
    setLoading(false);
  }, [limit]);

  useEffect(() => { fetch(); }, [fetch]);

  return { threads, loading, refresh: fetch };
}

// ─── useEmailConnections ──────────────────────────────────────────────────────

export interface EmailConnectionRecord {
  id: string;
  provider: EmailProvider;
  email: string;
  syncEnabled: boolean;
  backfillCompletedAt: string | null;
  createdAt: string;
}

interface UseEmailConnectionsReturn {
  google: EmailConnectionRecord | null;
  microsoft: EmailConnectionRecord | null;
  loading: boolean;
  refresh: () => void;
}

export function useEmailConnections(): UseEmailConnectionsReturn {
  const [connections, setConnections] = useState<EmailConnectionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user?.id) {
      setLoading(false);
      return;
    }

    const { data: conns } = await supabase
      .from("provider_connections")
      .select("id, provider, email, sync_enabled, backfill_completed_at, created_at")
      .eq("user_id", data.user.id)
      .order("created_at");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConnections((conns ?? []).map((r: any): EmailConnectionRecord => ({
      id:                  r.id,
      provider:            r.provider as EmailProvider,
      email:               r.email,
      syncEnabled:         r.sync_enabled,
      backfillCompletedAt: r.backfill_completed_at ?? null,
      createdAt:           r.created_at,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const google = connections.find((c) => c.provider === "google") ?? null;
  const microsoft = connections.find((c) => c.provider === "microsoft") ?? null;

  return { google, microsoft, loading, refresh: fetch };
}

// ─── useEmailSyncPreference ──────────────────────────────────────────────────

export interface EmailSyncPreference {
  declineCount: number;
  lastDeclinedAt: string | null;
  reminderShownAt: string | null;
}

interface UseEmailSyncPreferenceReturn {
  preference: EmailSyncPreference | null;
  loading: boolean;
  recordDecline: () => Promise<void>;
  recordReminderShown: () => Promise<void>;
  /** True if the opt-in modal should be shown based on decline/re-prompt rules. */
  shouldShowOptIn: boolean;
}

export function useEmailSyncPreference(): UseEmailSyncPreferenceReturn {
  const [preference, setPreference] = useState<EmailSyncPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) {
        setLoading(false);
        return;
      }
      setUserId(data.user.id);

      const { data: row } = await supabase
        .from("user_email_sync_preferences")
        .select("decline_count, last_declined_at, reminder_shown_at")
        .eq("user_id", data.user.id)
        .single();

      if (row) {
        setPreference({
          declineCount: row.decline_count,
          lastDeclinedAt: row.last_declined_at,
          reminderShownAt: row.reminder_shown_at,
        });
      }
      setLoading(false);
    })();
  }, []);

  const recordDecline = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const now = new Date().toISOString();

    if (preference) {
      await supabase
        .from("user_email_sync_preferences")
        .update({
          decline_count: preference.declineCount + 1,
          last_declined_at: now,
        })
        .eq("user_id", userId);
      setPreference({
        ...preference,
        declineCount: preference.declineCount + 1,
        lastDeclinedAt: now,
      });
    } else {
      await supabase.from("user_email_sync_preferences").insert({
        user_id: userId,
        decline_count: 1,
        last_declined_at: now,
      });
      setPreference({
        declineCount: 1,
        lastDeclinedAt: now,
        reminderShownAt: null,
      });
    }
  }, [userId, preference]);

  const recordReminderShown = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const now = new Date().toISOString();

    await supabase
      .from("user_email_sync_preferences")
      .update({ reminder_shown_at: now })
      .eq("user_id", userId);

    if (preference) {
      setPreference({ ...preference, reminderShownAt: now });
    }
  }, [userId, preference]);

  // Re-prompt logic:
  // - No preference row → show (first time)
  // - 1 decline, no reminder_shown_at, 7+ days since decline → show reminder
  // - 2+ declines OR reminder already shown → never auto-show
  const shouldShowOptIn = (() => {
    if (loading) return false;
    if (!preference) return true; // never declined → first time

    if (preference.declineCount >= 2) return false;
    if (preference.reminderShownAt) return false;

    if (preference.declineCount === 1 && preference.lastDeclinedAt) {
      const daysSinceDecline =
        (Date.now() - new Date(preference.lastDeclinedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      return daysSinceDecline >= 7;
    }

    return false;
  })();

  return { preference, loading, recordDecline, recordReminderShown, shouldShowOptIn };
}

// ─── useEmailTimeline ────────────────────────────────────────────────────────────

export interface LinkedMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
}

interface UseEmailTimelineReturn {
  messages: LinkedMessage[];
  loading: boolean;
}

export function useEmailTimeline(candidateId: string): UseEmailTimelineReturn {
  const [messages, setMessages] = useState<LinkedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("candidate_email_links")
          .select(
            `
            email_messages!inner(
              id,
              thread_id,
              from_addr,
              to_addrs,
              cc_addrs,
              subject,
              snippet,
              sent_at,
              direction
            )
          `
          )
          .eq("candidate_id", candidateId)
          .eq("status", "active");

        if (error) {
          console.error("Error fetching email timeline:", error);
          setMessages([]);
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formatted = (data ?? []).map((link: any) => ({
          id: link.email_messages.id,
          threadId: link.email_messages.thread_id,
          from: link.email_messages.from_addr,
          to: link.email_messages.to_addrs || [],
          cc: link.email_messages.cc_addrs || [],
          subject: link.email_messages.subject,
          snippet: link.email_messages.snippet,
          timestamp: new Date(link.email_messages.sent_at).getTime(),
          direction: link.email_messages.direction as "inbound" | "outbound",
        }));

        setMessages(formatted);
      } catch (error) {
        console.error("Failed to fetch email timeline:", error);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [candidateId]);

  return { messages, loading };
}

// ─── usePendingEmailMatchCount ────────────────────────────────────────────────
// Returns the count of candidate_email_links with status = 'pending_review'
// for the current user's agency. Used by the sidebar badge.

export function usePendingEmailMatchCount(): { count: number; loading: boolean } {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCount = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { count: total, error } = await supabase
          .from("candidate_email_links")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_review");

        if (!error && total !== null) {
          setCount(total);
        }
      } catch {
        // Silent fail — badge just won't show
      } finally {
        setLoading(false);
      }
    };
    fetchCount();
    // Refresh every 60s
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  return { count, loading };
}

// ─── useEmailConflicts ───────────────────────────────────────────────────────
// Checks if a candidate has any email links on conflicted threads.

export function useEmailConflicts(candidateId: string): { hasConflict: boolean; loading: boolean } {
  const [hasConflict, setHasConflict] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("candidate_email_links")
          .select(`
            email_messages!inner(
              email_threads!inner(has_conflict)
            )
          `)
          .eq("candidate_id", candidateId)
          .eq("email_messages.email_threads.has_conflict", true)
          .limit(1);

        if (!error && data && data.length > 0) {
          setHasConflict(true);
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [candidateId]);

  return { hasConflict, loading };
}

// ─── useScheduledInterviews ───────────────────────────────────────────────────

export interface ScheduledInterview {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateTitle?: string;
  jobId: string;
  jobTitle: string;
  clientName?: string;
  date: string;          // ISO date YYYY-MM-DD
  startTime: string;     // HH:MM
  endTime: string;
  format: "video" | "phone" | "onsite" | "panel";
  location?: string;
  meetingLink?: string;
  interviewers: { id: string; name: string; email: string; role?: string; isExternal?: boolean }[];
  notes?: string;
  notifyCandidate: boolean;
  notifyClient: boolean;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  createdAt: string;
}

export function useScheduledInterviews() {
  // US-317: migrated off useState+useEffect to useQuery so the dashboard's
  // parallel mounts share a single cached result instead of triggering a
  // fresh DB round-trip per component.
  const queryClient = useQueryClient();

  const { data: interviews = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["scheduled-interviews"],
    queryFn: async (): Promise<ScheduledInterview[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("scheduled_interviews")
        .select(`
          id, candidate_id, job_id, interview_date, start_time, end_time,
          format, location, meeting_link, interviewers, notes,
          notify_candidate, notify_client, status, created_at,
          candidates(first_name, last_name, current_title),
          jobs(title, companies(name))
        `)
        .order("interview_date", { ascending: true })
        .order("start_time",     { ascending: true });
      if (error || !data) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((r): ScheduledInterview => ({
        id:               r.id,
        candidateId:      r.candidate_id,
        candidateName:    r.candidates ? `${r.candidates.first_name} ${r.candidates.last_name}` : "Unknown",
        candidateTitle:   r.candidates?.current_title ?? undefined,
        jobId:            r.job_id,
        jobTitle:         r.jobs?.title ?? "Unknown",
        clientName:       r.jobs?.companies?.name ?? undefined,
        date:             r.interview_date,
        startTime:        r.start_time,
        endTime:          r.end_time,
        format:           r.format ?? "video",
        location:         r.location ?? undefined,
        meetingLink:      r.meeting_link ?? undefined,
        interviewers:     r.interviewers ?? [],
        notes:            r.notes ?? undefined,
        notifyCandidate:  r.notify_candidate ?? true,
        notifyClient:     r.notify_client ?? true,
        status:           r.status ?? "scheduled",
        createdAt:        r.created_at,
      }));
    },
    staleTime: 30_000,
  });

  const fetchInterviews = useCallback(async () => {
    await refetch();
  }, [refetch]);

  async function scheduleInterview(input: Omit<ScheduledInterview, "id" | "createdAt" | "status">): Promise<ScheduledInterview | null> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: userRow } = await supabase
      .from("users")
      .select("agency_id")
      .eq("id", user.id)
      .single();
    if (!userRow?.agency_id) return null;

    const { data, error } = await supabase
      .from("scheduled_interviews")
      .insert({
        agency_id:        userRow.agency_id,
        candidate_id:     input.candidateId,
        job_id:           input.jobId,
        interview_date:   input.date,
        start_time:       input.startTime,
        end_time:         input.endTime,
        format:           input.format,
        location:         input.location ?? null,
        meeting_link:     input.meetingLink ?? null,
        interviewers:     input.interviewers,
        notes:            input.notes ?? null,
        notify_candidate: input.notifyCandidate,
        notify_client:    input.notifyClient,
        status:           "scheduled",
      })
      .select()
      .single();

    if (error || !data) return null;

    // Optimistically add to local state (re-fetch for joined data)
    await fetchInterviews();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any) as ScheduledInterview;
  }

  async function updateStatus(id: string, status: ScheduledInterview["status"]) {
    const supabase = createClient();
    await supabase.from("scheduled_interviews").update({ status }).eq("id", id);
    // Optimistic cache patch — keep UI snappy without a full refetch
    queryClient.setQueryData<ScheduledInterview[]>(["scheduled-interviews"], (prev) =>
      (prev ?? []).map((i) => (i.id === id ? { ...i, status } : i))
    );
  }

  return { interviews, loading, scheduleInterview, updateStatus, refresh: fetchInterviews };
}

// ─── useFunnelCounts ──────────────────────────────────────────────────────────
// Counts candidates per pipeline stage across all active jobs for the agency.

export interface FunnelStage {
  stageName: string;
  count: number;
}

export function useFunnelCounts() {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("candidate_pipeline_entries")
      .select("pipeline_stages!inner(name)")
      .eq("status", "active")
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }
        // Aggregate count per stage name
        const counts: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any[]).forEach((row) => {
          const name: string = row.pipeline_stages?.name ?? "Unknown";
          counts[name] = (counts[name] ?? 0) + 1;
        });
        setStages(
          Object.entries(counts)
            .map(([stageName, count]) => ({ stageName, count }))
            .sort((a, b) => b.count - a.count)
        );
        setLoading(false);
      });
  }, []);

  return { stages, loading };
}

// ─── useRecruiterStats ────────────────────────────────────────────────────────
// Aggregates submission + placement counts per recruiter from activities.

export interface RecruiterStat {
  userId: string;
  fullName: string;
  submissions: number;
  placements: number;
  revenue: number;
}

export function useRecruiterStats() {
  const [stats, setStats] = useState<RecruiterStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    Promise.all([
      supabase
        .from("activities")
        .select("actor_id, users!inner(full_name)")
        .eq("action", "submission"),
      supabase
        .from("placements")
        .select("candidate_id, fee_amount, users!inner(id, full_name)"),
    ]).then(([actRes, plRes]) => {
      const submissionMap: Record<string, { fullName: string; count: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (actRes.data ?? []).forEach((row: any) => {
        const id   = row.actor_id as string;
        const name = row.users?.full_name ?? "Unknown";
        if (!submissionMap[id]) submissionMap[id] = { fullName: name, count: 0 };
        submissionMap[id].count += 1;
      });

      const placementMap: Record<string, { fullName: string; count: number; revenue: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (plRes.data ?? []).forEach((row: any) => {
        const id   = row.users?.id as string;
        const name = row.users?.full_name ?? "Unknown";
        if (!id) return;
        if (!placementMap[id]) placementMap[id] = { fullName: name, count: 0, revenue: 0 };
        placementMap[id].count   += 1;
        placementMap[id].revenue += row.fee_amount ?? 0;
      });

      const allIds = new Set([...Object.keys(submissionMap), ...Object.keys(placementMap)]);
      const result: RecruiterStat[] = Array.from(allIds).map((id) => ({
        userId:      id,
        fullName:    submissionMap[id]?.fullName ?? placementMap[id]?.fullName ?? "Unknown",
        submissions: submissionMap[id]?.count ?? 0,
        placements:  placementMap[id]?.count ?? 0,
        revenue:     placementMap[id]?.revenue ?? 0,
      })).sort((a, b) => b.revenue - a.revenue);

      setStats(result);
      setLoading(false);
    });
  }, []);

  return { stats, loading };
}

// Used by the Candidates page to show the "Review matches" badge.

export function usePendingEmailMatches() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("candidate_email_links")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review")
      .then(({ count: n }) => { setCount(n ?? 0); });
  }, []);

  return { count };
}

// ─── useOutreachSequences ─────────────────────────────────────────────────────

export interface OutreachSequenceStep {
  id: string;
  type: "email" | "wait";
  delayDays: number;
  subject?: string;
  body?: string;
}

export interface OutreachSequence {
  id: string;
  name: string;
  tag?: string;
  status: "active" | "paused" | "draft";
  steps: OutreachSequenceStep[];
  enrolled: number;
  sent: number;
  opened: number;
  replied: number;
  createdAt: string;
}

export type NewOutreachSequenceInput = Omit<OutreachSequence, "id" | "createdAt">;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSequence(row: any): OutreachSequence {
  return {
    id:        row.id,
    name:      row.name,
    tag:       row.tag ?? undefined,
    status:    row.status as OutreachSequence["status"],
    steps:     (row.steps ?? []) as OutreachSequenceStep[],
    enrolled:  row.enrolled ?? 0,
    sent:      row.sent ?? 0,
    opened:    row.opened ?? 0,
    replied:   row.replied ?? 0,
    createdAt: row.created_at,
  };
}

interface UseOutreachSequencesReturn {
  sequences: OutreachSequence[];
  loading: boolean;
  createSequence: (input: NewOutreachSequenceInput) => Promise<OutreachSequence | null>;
  updateSequence:  (id: string, patch: Partial<Omit<OutreachSequence, "id" | "createdAt">>) => Promise<boolean>;
  deleteSequence:  (id: string) => Promise<boolean>;
  cloneSequence:   (seq: OutreachSequence) => Promise<OutreachSequence | null>;
  toggleStatus:    (id: string) => Promise<void>;
  incrementEnrolled: (id: string, delta: number) => Promise<void>;
}

export function useOutreachSequences(): UseOutreachSequencesReturn {
  // US-317: React Query migration — multiple dashboard components sharing the
  // same queryKey deduplicate into a single fetch instead of each component
  // firing its own load.
  const queryClient = useQueryClient();

  const { data: sequences = [], isLoading: loading } = useQuery({
    queryKey: ["outreach-sequences"],
    queryFn: async (): Promise<OutreachSequence[]> => {
      const supabase = createClient();
      const { data } = await supabase
        .from("outreach_sequences")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []).map(mapSequence);
    },
    staleTime: 30_000,
  });

  const patchCache = (updater: (prev: OutreachSequence[]) => OutreachSequence[]) => {
    queryClient.setQueryData<OutreachSequence[]>(["outreach-sequences"], (prev) => updater(prev ?? []));
  };

  async function createSequence(input: NewOutreachSequenceInput): Promise<OutreachSequence | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("outreach_sequences")
      .insert({
        name:     input.name,
        tag:      input.tag ?? null,
        status:   input.status,
        steps:    input.steps,
        enrolled: input.enrolled,
        sent:     input.sent,
        opened:   input.opened,
        replied:  input.replied,
      })
      .select()
      .single();

    if (error || !data) return null;
    const created = mapSequence(data);
    patchCache((prev) => [created, ...prev]);
    return created;
  }

  async function updateSequence(
    id: string,
    patch: Partial<Omit<OutreachSequence, "id" | "createdAt">>
  ): Promise<boolean> {
    // Optimistic update
    patchCache((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

    const supabase = createClient();
    const dbPatch: Record<string, unknown> = {};
    if (patch.name     !== undefined) dbPatch.name     = patch.name;
    if (patch.tag      !== undefined) dbPatch.tag      = patch.tag ?? null;
    if (patch.status   !== undefined) dbPatch.status   = patch.status;
    if (patch.steps    !== undefined) dbPatch.steps    = patch.steps;
    if (patch.enrolled !== undefined) dbPatch.enrolled = patch.enrolled;
    if (patch.sent     !== undefined) dbPatch.sent     = patch.sent;
    if (patch.opened   !== undefined) dbPatch.opened   = patch.opened;
    if (patch.replied  !== undefined) dbPatch.replied  = patch.replied;

    const { error } = await supabase
      .from("outreach_sequences")
      .update(dbPatch)
      .eq("id", id);

    if (error) {
      // Rollback not needed — next load will reconcile
      return false;
    }
    return true;
  }

  async function deleteSequence(id: string): Promise<boolean> {
    patchCache((prev) => prev.filter((s) => s.id !== id));

    const supabase = createClient();
    const { error } = await supabase
      .from("outreach_sequences")
      .delete()
      .eq("id", id);

    return !error;
  }

  async function cloneSequence(seq: OutreachSequence): Promise<OutreachSequence | null> {
    const cloned = await createSequence({
      name:     `${seq.name} (Copy)`,
      tag:      seq.tag,
      status:   "draft",
      steps:    seq.steps.map((s) => ({ ...s, id: `${s.id}-copy-${Date.now()}` })),
      enrolled: 0,
      sent:     0,
      opened:   0,
      replied:  0,
    });
    return cloned;
  }

  async function toggleStatus(id: string): Promise<void> {
    const seq = sequences.find((s) => s.id === id);
    if (!seq) return;
    const next: OutreachSequence["status"] = seq.status === "active" ? "paused" : "active";
    await updateSequence(id, { status: next });
  }

  async function incrementEnrolled(id: string, delta: number): Promise<void> {
    const seq = sequences.find((s) => s.id === id);
    if (!seq) return;
    await updateSequence(id, { enrolled: seq.enrolled + delta });
  }

  return {
    sequences,
    loading,
    createSequence,
    updateSequence,
    deleteSequence,
    cloneSequence,
    toggleStatus,
    incrementEnrolled,
  };
}

// ─── useSequenceEnrollments ───────────────────────────────────────────────────

export type EnrollmentStatus = "active" | "paused" | "completed" | "unsubscribed" | "bounced";

export interface SequenceEnrollment {
  id: string;
  sequenceId: string;
  candidateId: string;
  candidateName: string;
  candidateTitle?: string;
  candidateCompany?: string;
  enrolledById?: string;
  status: EnrollmentStatus;
  currentStep: number;
  nextSendAt?: string;
  startedAt: string;
  completedAt?: string;
  emailsSent: number;
  opened: boolean;
  replied: boolean;
}

interface UseSequenceEnrollmentsReturn {
  enrollments: SequenceEnrollment[];
  loading: boolean;
  enroll: (candidateIds: string[], firstSendAt?: string) => Promise<number>;
  pauseEnrollment:   (id: string) => Promise<void>;
  resumeEnrollment:  (id: string) => Promise<void>;
  removeEnrollment:  (id: string) => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEnrollment(row: any): SequenceEnrollment {
  const candidate = row.candidates;
  return {
    id:               row.id,
    sequenceId:       row.sequence_id,
    candidateId:      row.candidate_id,
    candidateName:    candidate ? `${candidate.first_name} ${candidate.last_name}` : "Unknown",
    candidateTitle:   candidate?.current_title ?? undefined,
    candidateCompany: candidate?.current_company ?? undefined,
    enrolledById:     row.enrolled_by ?? undefined,
    status:           row.status as EnrollmentStatus,
    currentStep:      row.current_step ?? 0,
    nextSendAt:       row.next_send_at ?? undefined,
    startedAt:        row.started_at,
    completedAt:      row.completed_at ?? undefined,
    emailsSent:       row.emails_sent ?? 0,
    opened:           row.opened ?? false,
    replied:          row.replied ?? false,
  };
}

export function useSequenceEnrollments(sequenceId: string): UseSequenceEnrollmentsReturn {
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!sequenceId) return;
    const supabase = createClient();
    supabase
      .from("sequence_enrollments")
      .select("*, candidates(first_name, last_name, current_title, current_company)")
      .eq("sequence_id", sequenceId)
      .order("started_at", { ascending: false })
      .then(({ data }) => {
        setEnrollments((data ?? []).map(mapEnrollment));
        setLoading(false);
      });
  }, [sequenceId]);

  async function enroll(candidateIds: string[], firstSendAt?: string): Promise<number> {
    if (candidateIds.length === 0) return 0;
    const supabase = createClient();

    // Get current user's agency_id from existing agency resolution
    const { data: userData } = await supabase
      .from("users")
      .select("agency_id, id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();

    if (!userData?.agency_id) return 0;

    const rows = candidateIds.map((candidateId) => ({
      sequence_id:  sequenceId,
      candidate_id: candidateId,
      agency_id:    userData.agency_id,
      enrolled_by:  userData.id,
      next_send_at: firstSendAt ?? new Date().toISOString(),
      status:       "active",
    }));

    const { data, error } = await supabase
      .from("sequence_enrollments")
      .upsert(rows, { onConflict: "sequence_id,candidate_id", ignoreDuplicates: true })
      .select("*, candidates(first_name, last_name, current_title, current_company)");

    if (error || !data) return 0;
    const created = data.map(mapEnrollment);
    setEnrollments((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      return [...created.filter((e) => !existingIds.has(e.id)), ...prev];
    });
    return created.length;
  }

  async function pauseEnrollment(id: string): Promise<void> {
    setEnrollments((prev) => prev.map((e) => e.id === id ? { ...e, status: "paused", nextSendAt: undefined } : e));
    const supabase = createClient();
    await supabase
      .from("sequence_enrollments")
      .update({ status: "paused", next_send_at: null })
      .eq("id", id);
  }

  async function resumeEnrollment(id: string): Promise<void> {
    const nextSendAt = new Date().toISOString();
    setEnrollments((prev) => prev.map((e) => e.id === id ? { ...e, status: "active", nextSendAt } : e));
    const supabase = createClient();
    await supabase
      .from("sequence_enrollments")
      .update({ status: "active", next_send_at: nextSendAt })
      .eq("id", id);
  }

  async function removeEnrollment(id: string): Promise<void> {
    setEnrollments((prev) => prev.filter((e) => e.id !== id));
    const supabase = createClient();
    await supabase.from("sequence_enrollments").delete().eq("id", id);
  }

  return { enrollments, loading, enroll, pauseEnrollment, resumeEnrollment, removeEnrollment };
}

// ─── useNotifications ─────────────────────────────────────────────────────────

export type NotifType =
  | "stage_change" | "client_feedback" | "task_due"
  | "outreach_reply" | "saved_search" | "placement" | "mention";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }

      const { data: rows } = await supabase
        .from("notifications")
        .select("id, type, title, body, href, read, created_at")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (rows) {
        setNotifications(rows.map((r) => ({
          id: r.id,
          type: r.type as NotifType,
          title: r.title,
          body: r.body,
          href: r.href ?? undefined,
          read: r.read,
          createdAt: r.created_at,
        })));
      }
      setLoading(false);

      // Subscribe to real-time inserts
      channel = supabase
        .channel(`notifications:${data.user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${data.user.id}` },
          (payload) => {
            const r = payload.new as Record<string, unknown>;
            setNotifications((prev) => [{
              id: r.id as string,
              type: r.type as NotifType,
              title: r.title as string,
              body: (r.body as string) ?? "",
              href: (r.href as string | null) ?? undefined,
              read: false,
              createdAt: r.created_at as string,
            }, ...prev]);
          }
        )
        .subscribe();
    });

    return () => { if (channel) channel.unsubscribe(); };
  }, []);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("read", false);
  }

  async function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }

  return { notifications, loading, markRead, markAllRead, dismiss };
}

// ─── useSavedSearches ─────────────────────────────────────────────────────────

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  statusFilter: string;
  sourceFilter: string;
  alertsEnabled: boolean;
  alertFrequency: "instant" | "daily" | "weekly";
  resultCount: number;
  createdAt: string;
}

export type NewSavedSearchInput = Omit<SavedSearch, "id" | "createdAt">;

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      const { data: rows } = await supabase
        .from("saved_searches")
        .select("id, name, query, status_filter, source_filter, alerts_enabled, alert_frequency, result_count, created_at")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false });
      if (rows) {
        setSearches(rows.map((r) => ({
          id:             r.id,
          name:           r.name,
          query:          r.query,
          statusFilter:   r.status_filter,
          sourceFilter:   r.source_filter,
          alertsEnabled:  r.alerts_enabled,
          alertFrequency: r.alert_frequency as "instant" | "daily" | "weekly",
          resultCount:    r.result_count,
          createdAt:      r.created_at,
        })));
      }
      setLoading(false);
    });
  }, []);

  async function createSearch(input: NewSavedSearchInput): Promise<SavedSearch | null> {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return null;

    const { data: userRow } = await supabase
      .from("users").select("agency_id").eq("id", user.user.id).single();
    if (!userRow) return null;

    const { data, error } = await supabase
      .from("saved_searches")
      .insert({
        name:            input.name,
        query:           input.query,
        status_filter:   input.statusFilter,
        source_filter:   input.sourceFilter,
        alerts_enabled:  input.alertsEnabled,
        alert_frequency: input.alertFrequency,
        result_count:    input.resultCount,
        user_id:         user.user.id,
        agency_id:       userRow.agency_id,
      })
      .select("id, name, query, status_filter, source_filter, alerts_enabled, alert_frequency, result_count, created_at")
      .single();

    if (error || !data) return null;
    const newSearch: SavedSearch = {
      id: data.id, name: data.name, query: data.query,
      statusFilter: data.status_filter, sourceFilter: data.source_filter,
      alertsEnabled: data.alerts_enabled, alertFrequency: data.alert_frequency,
      resultCount: data.result_count, createdAt: data.created_at,
    };
    setSearches((prev) => [newSearch, ...prev]);
    return newSearch;
  }

  async function toggleAlert(id: string): Promise<void> {
    const target = searches.find((s) => s.id === id);
    if (!target) return;
    const next = !target.alertsEnabled;
    setSearches((prev) => prev.map((s) => s.id === id ? { ...s, alertsEnabled: next } : s));
    const supabase = createClient();
    await supabase.from("saved_searches").update({ alerts_enabled: next }).eq("id", id);
  }

  async function deleteSearch(id: string): Promise<void> {
    setSearches((prev) => prev.filter((s) => s.id !== id));
    const supabase = createClient();
    await supabase.from("saved_searches").delete().eq("id", id);
  }

  async function saveSearch(
    name: string,
    query: string,
    _filters: Record<string, unknown>,
    resultCount: number
  ): Promise<SavedSearch | null> {
    return createSearch({ name, query, statusFilter: "", sourceFilter: "", alertsEnabled: false, alertFrequency: "daily", resultCount });
  }

  return { searches, savedSearches: searches, loading, createSearch, saveSearch, toggleAlert, deleteSearch };
}

// ── useAuditLog ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  userId: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export function useAuditLog(filters: AuditFilters = {}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const PAGE = 50;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      // Resolve agency_id for current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: userRow } = await supabase
        .from("users").select("agency_id").eq("id", user.id).single();
      if (!userRow) { setLoading(false); return; }

      let q = supabase
        .from("audit_log")
        .select("id, user_id, action, entity_type, entity_id, entity_label, metadata, created_at")
        .eq("agency_id", userRow.agency_id)
        .order("created_at", { ascending: false })
        .limit(PAGE + 1);

      if (filters.action)     q = q.eq("action", filters.action);
      if (filters.entityType) q = q.eq("entity_type", filters.entityType);
      if (filters.userId)     q = q.eq("user_id", filters.userId);
      if (filters.from)       q = q.gte("created_at", filters.from);
      if (filters.to)         q = q.lte("created_at", filters.to);

      const { data } = await q;
      if (cancelled) return;

      const rows = data ?? [];
      setHasMore(rows.length > PAGE);
      setEntries(
        rows.slice(0, PAGE).map((r) => ({
          id: r.id,
          userId: r.user_id,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          entityLabel: r.entity_label,
          metadata: r.metadata ?? {},
          createdAt: r.created_at,
        }))
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [filters.action, filters.entityType, filters.userId, filters.from, filters.to]);

  async function logAction(
    action: string,
    entityType: string,
    entityId?: string,
    entityLabel?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userRow } = await supabase
      .from("users").select("agency_id").eq("id", user.id).single();
    if (!userRow) return;
    await supabase.from("audit_log").insert({
      agency_id:    userRow.agency_id,
      user_id:      user.id,
      action,
      entity_type:  entityType,
      entity_id:    entityId ?? null,
      entity_label: entityLabel ?? null,
      metadata,
    });
  }

  return { entries, loading, hasMore, logAction };
}

// ─── useSLABreaches ───────────────────────────────────────────────────────────

export interface SLABreach {
  entryId:       string;
  candidateId:   string;
  candidateName: string;
  jobId:         string;
  jobTitle:      string;
  stageName:     string;
  daysInStage:   number;
  slaDays:       number;
  daysOverdue:   number;
}

export function useSLABreaches() {
  const { data: breaches = [], isLoading: loading } = useQuery({
    queryKey: ["sla-breaches"],
    queryFn: async (): Promise<SLABreach[]> => {
      const supabase = createClient();
      const { data } = await supabase
        .from("candidate_pipeline_entries")
        .select(`
          id, candidate_id, job_id, entered_stage_at,
          candidates(first_name, last_name),
          jobs(title),
          pipeline_stages(name, sla_days)
        `)
        .eq("status", "active");

      const now = Date.now();
      const results: SLABreach[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (data ?? []) as any[]) {
        const slaDays = row.pipeline_stages?.sla_days as number | null;
        if (!slaDays) continue;
        const enteredAt   = row.entered_stage_at as string;
        const daysInStage = Math.floor((now - new Date(enteredAt).getTime()) / 86_400_000);
        if (daysInStage <= slaDays) continue;
        results.push({
          entryId:       row.id as string,
          candidateId:   row.candidate_id as string,
          candidateName: row.candidates
            ? `${row.candidates.first_name} ${row.candidates.last_name}`.trim()
            : "Unknown",
          jobId:         row.job_id as string,
          jobTitle:      row.jobs?.title ?? "Unknown Job",
          stageName:     row.pipeline_stages?.name ?? "Unknown Stage",
          daysInStage,
          slaDays,
          daysOverdue:   daysInStage - slaDays,
        });
      }
      return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
    },
    staleTime: 30_000,
  });

  return { breaches, count: breaches.length, loading };
}

// ─── useTags (agency-wide tag library) ───────────────────────────────────────

export interface TagRecord {
  id:        string;
  name:      string;
  color:     string;
  createdAt: string;
}

export function useTags() {
  const [tags, setTags]       = useState<TagRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("tags")
      .select("*")
      .order("name");
    setTags((data ?? []).map((r) => ({ id: r.id, name: r.name, color: r.color, createdAt: r.created_at })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  async function createTag(name: string, color: string): Promise<TagRecord | null> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: userRow } = await supabase.from("users").select("org_id").eq("id", user.id).single();
    if (!userRow) return null;
    const { data, error } = await supabase
      .from("tags")
      .insert({ org_id: userRow.org_id, name: name.trim(), color })
      .select()
      .single();
    if (error || !data) return null;
    const newTag: TagRecord = { id: data.id, name: data.name, color: data.color, createdAt: data.created_at };
    setTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)));
    return newTag;
  }

  async function deleteTag(tagId: string): Promise<void> {
    const supabase = createClient();
    await supabase.from("tags").delete().eq("id", tagId);
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  return { tags, loading, createTag, deleteTag, refresh: fetchTags };
}

// ─── useCandidateTags ─────────────────────────────────────────────────────────

export function useCandidateTags(candidateId: string) {
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);

  const fetchApplied = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("candidate_tags")
      .select("tag_id")
      .eq("candidate_id", candidateId);
    setAppliedIds(new Set((data ?? []).map((r: { tag_id: string }) => r.tag_id)));
    setLoading(false);
  }, [candidateId]);

  useEffect(() => { fetchApplied(); }, [fetchApplied]);

  async function addTag(tagId: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from("candidate_tags")
      .insert({ candidate_id: candidateId, tag_id: tagId });
    if (!error) setAppliedIds((prev) => new Set([...prev, tagId]));
  }

  async function removeTag(tagId: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from("candidate_tags")
      .delete()
      .eq("candidate_id", candidateId)
      .eq("tag_id", tagId);
    setAppliedIds((prev) => { const s = new Set(prev); s.delete(tagId); return s; });
  }

  return { appliedIds, loading, addTag, removeTag, refresh: fetchApplied };
}

// ─── usePermissions ───────────────────────────────────────────────────────────
// Returns the current user's role and a `can(permission)` checker.
// Fetches once on mount; memoized thereafter.

export interface UsePermissionsResult {
  role:    UserRole | null;
  loading: boolean;
  /** Returns true if the current user has the given permission. */
  can:     (permission: Permission) => boolean;
  /** Returns true if the current user has ALL of the given permissions. */
  canAll:  (...permissions: Permission[]) => boolean;
  /** Returns true if the current user has ANY of the given permissions. */
  canAny:  (...permissions: Permission[]) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const [role, setRole]       = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      const { data: row } = await supabase
        .from("users")
        .select("role")
        .eq("id", data.user.id)
        .single();
      setRole((row?.role as UserRole) ?? null);
      setLoading(false);
    });
  }, []);

  const can    = useCallback((p: Permission) => hasPermission(role, p), [role]);
  const canAll = useCallback((...ps: Permission[]) => ps.every((p) => hasPermission(role, p)), [role]);
  const canAny = useCallback((...ps: Permission[]) => ps.some((p) => hasPermission(role, p)), [role]);

  return { role, loading, can, canAll, canAny };
}

// ─── useDuplicates ────────────────────────────────────────────────────────────
// Detects potential duplicate candidates using email, phone, and name heuristics.
// Returns groups of duplicates; each group contains 2+ candidates.

export interface DuplicateGroup {
  id:         string;   // deterministic group key
  reason:     "email" | "phone" | "name";
  confidence: "high" | "medium";
  candidates: Candidate[];
}

function normalise(s?: string) {
  return (s ?? "").toLowerCase().replace(/[\s\-().+]/g, "");
}

export function useDuplicates(candidates: Candidate[]): {
  groups:  DuplicateGroup[];
  loading: false;
} {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  // ── Email duplicates ──────────────────────────────────────────────────────
  const byEmail = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = normalise(c.email);
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(c);
  }
  for (const [email, group] of byEmail) {
    if (group.length < 2) continue;
    const groupId = `email:${email}`;
    if (seen.has(groupId)) continue;
    seen.add(groupId);
    groups.push({ id: groupId, reason: "email", confidence: "high", candidates: group });
  }

  // ── Phone duplicates ──────────────────────────────────────────────────────
  const byPhone = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = normalise(c.phone);
    if (!key || key.length < 7) continue;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key)!.push(c);
  }
  for (const [phone, group] of byPhone) {
    if (group.length < 2) continue;
    const groupId = `phone:${phone}`;
    if (seen.has(groupId)) continue;
    // Skip if all members are already in an email group
    const alreadyCovered = group.every((c) =>
      groups.some((g) => g.reason === "email" && g.candidates.some((gc) => gc.id === c.id))
    );
    if (alreadyCovered) continue;
    seen.add(groupId);
    groups.push({ id: groupId, reason: "phone", confidence: "high", candidates: group });
  }

  // ── Name duplicates ───────────────────────────────────────────────────────
  const byName = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = normalise(c.fullName);
    if (!key || key.length < 4) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(c);
  }
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const groupId = `name:${name}`;
    if (seen.has(groupId)) continue;
    // Skip if all members are already in a higher-confidence group
    const alreadyCovered = group.every((c) =>
      groups.some((g) => g.reason !== "name" && g.candidates.some((gc) => gc.id === c.id))
    );
    if (alreadyCovered) continue;
    seen.add(groupId);
    groups.push({ id: groupId, reason: "name", confidence: "medium", candidates: group });
  }

  return { groups, loading: false };
}

// ─── Custom Fields ────────────────────────────────────────────────────────────

export type CustomFieldType = "text" | "textarea" | "number" | "date" | "boolean" | "select" | "url" | "email";
export type CustomFieldEntity = "candidate" | "job" | "company" | "placement";

export interface CustomFieldDefinition {
  id:            string;
  agencyId:      string;
  entity:        CustomFieldEntity;
  name:          string;
  key:           string;
  fieldType:     CustomFieldType;
  options:       string[] | null;
  required:      boolean;
  searchable:    boolean;
  clientVisible: boolean;
  sortOrder:     number;
  createdAt:     string;
}

export interface CustomFieldValue {
  id:           string;
  definitionId: string;
  recordId:     string;
  entity:       CustomFieldEntity;
  value:        string | number | boolean | null;
}

// ── useCustomFieldDefinitions ─────────────────────────────────────────────────
// Manages custom field schema for a given entity type.

export function useCustomFieldDefinitions(entity?: CustomFieldEntity) {
  const [defs,    setDefs]    = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let q = supabase
      .from("custom_field_definitions")
      .select("*")
      .order("sort_order", { ascending: true });
    if (entity) q = q.eq("entity", entity);
    const { data } = await q;
    setDefs((data ?? []).map((r: Record<string, unknown>) => ({
      id:            r.id as string,
      agencyId:      r.agency_id as string,
      entity:        r.entity as CustomFieldEntity,
      name:          r.name as string,
      key:           r.key as string,
      fieldType:     r.field_type as CustomFieldType,
      options:       (r.options as string[] | null) ?? null,
      required:      r.required as boolean,
      searchable:    r.searchable as boolean,
      clientVisible: r.client_visible as boolean,
      sortOrder:     r.sort_order as number,
      createdAt:     r.created_at as string,
    })));
    setLoading(false);
  }, [entity]);

  useEffect(() => { fetch(); }, [fetch]);

  async function createField(input: {
    entity:       CustomFieldEntity;
    name:         string;
    key:          string;
    fieldType:    CustomFieldType;
    options?:     string[];
    required?:    boolean;
    searchable?:  boolean;
    clientVisible?: boolean;
  }): Promise<CustomFieldDefinition | null> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: userRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!userRow?.agency_id) return null;

    const { data, error } = await supabase
      .from("custom_field_definitions")
      .insert({
        agency_id:      userRow.agency_id,
        entity:         input.entity,
        name:           input.name,
        key:            input.key,
        field_type:     input.fieldType,
        options:        input.options ?? null,
        required:       input.required ?? false,
        searchable:     input.searchable ?? false,
        client_visible: input.clientVisible ?? false,
        sort_order:     defs.length,
      })
      .select("*")
      .single();

    if (error || !data) return null;
    const mapped: CustomFieldDefinition = {
      id: data.id, agencyId: data.agency_id, entity: data.entity,
      name: data.name, key: data.key, fieldType: data.field_type,
      options: data.options, required: data.required,
      searchable: data.searchable, clientVisible: data.client_visible,
      sortOrder: data.sort_order, createdAt: data.created_at,
    };
    setDefs((prev) => [...prev, mapped]);
    return mapped;
  }

  async function deleteField(id: string): Promise<void> {
    const supabase = createClient();
    await supabase.from("custom_field_definitions").delete().eq("id", id);
    setDefs((prev) => prev.filter((d) => d.id !== id));
  }

  async function updateField(id: string, patch: Partial<Pick<CustomFieldDefinition, "name" | "required" | "searchable" | "clientVisible" | "options">>): Promise<void> {
    const supabase = createClient();
    const dbPatch: Record<string, unknown> = {};
    if (patch.name          !== undefined) dbPatch.name           = patch.name;
    if (patch.required      !== undefined) dbPatch.required       = patch.required;
    if (patch.searchable    !== undefined) dbPatch.searchable     = patch.searchable;
    if (patch.clientVisible !== undefined) dbPatch.client_visible = patch.clientVisible;
    if (patch.options       !== undefined) dbPatch.options        = patch.options;
    await supabase.from("custom_field_definitions").update(dbPatch).eq("id", id);
    setDefs((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  }

  return { defs, loading, createField, deleteField, updateField, refresh: fetch };
}

// ── useCustomFieldValues ──────────────────────────────────────────────────────
// Reads and writes custom field values for a specific record.

export function useCustomFieldValues(entity: CustomFieldEntity, recordId: string | null | undefined) {
  const [values,  setValues]  = useState<Record<string, CustomFieldValue>>({});
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!recordId) { setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("custom_field_values")
      .select("*")
      .eq("entity", entity)
      .eq("record_id", recordId);

    const map: Record<string, CustomFieldValue> = {};
    for (const r of (data ?? [])) {
      const val = r.value_text ?? r.value_number ?? r.value_boolean ?? r.value_date ?? null;
      map[r.definition_id] = {
        id:           r.id,
        definitionId: r.definition_id,
        recordId:     r.record_id,
        entity:       r.entity,
        value:        val,
      };
    }
    setValues(map);
    setLoading(false);
  }, [entity, recordId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function setValue(defId: string, fieldType: CustomFieldType, rawValue: string | number | boolean | null): Promise<void> {
    if (!recordId) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!userRow?.agency_id) return;

    // Map to the appropriate typed column
    const colMap: Record<CustomFieldType, string> = {
      text: "value_text", textarea: "value_text", url: "value_text", email: "value_text",
      select: "value_text", number: "value_number", date: "value_date", boolean: "value_boolean",
    };
    const col = colMap[fieldType] ?? "value_text";

    const payload: Record<string, unknown> = {
      agency_id:     userRow.agency_id,
      definition_id: defId,
      entity,
      record_id:     recordId,
      value_text:    null,
      value_number:  null,
      value_date:    null,
      value_boolean: null,
      [col]:         rawValue,
      updated_at:    new Date().toISOString(),
    };

    const existing = values[defId];
    if (existing) {
      await supabase.from("custom_field_values").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("custom_field_values").insert(payload);
    }

    setValues((prev) => ({
      ...prev,
      [defId]: { id: existing?.id ?? "", definitionId: defId, recordId, entity, value: rawValue },
    }));
  }

  return { values, loading, setValue, refresh: fetch };
}

// ─── Scorecards ───────────────────────────────────────────────────────────────

export interface ScorecardCriterion {
  id:          string;
  label:       string;
  description: string;
  weight:      number;   // 1-10
  scale:       number;   // max score (default 5)
}

export interface ScorecardTemplate {
  id:          string;
  agencyId:    string;
  jobId:       string | null;
  name:        string;
  description: string | null;
  criteria:    ScorecardCriterion[];
  createdBy:   string | null;
  createdAt:   string;
}

export interface ScorecardRating {
  score: number;
  note?: string;
}

export type ScorecardRecommendation = "strong_yes" | "yes" | "maybe" | "no" | "strong_no";

export interface ScorecardSubmission {
  id:                string;
  agencyId:          string;
  templateId:        string | null;
  candidateId:       string;
  jobId:             string | null;
  interviewerId:     string | null;
  interviewerName:   string | null;
  stage:             string | null;
  overallRating:     number | null;
  recommendation:    ScorecardRecommendation | null;
  ratings:           Record<string, ScorecardRating>;
  notes:             string | null;
  pros:              string | null;
  cons:              string | null;
  submittedVia:      "internal" | "portal";
  portalClientName:  string | null;
  portalClientEmail: string | null;
  submittedAt:       string | null;
  createdAt:         string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(r: any): ScorecardTemplate {
  return {
    id:          r.id,
    agencyId:    r.agency_id,
    jobId:       r.job_id ?? null,
    name:        r.name,
    description: r.description ?? null,
    criteria:    r.criteria ?? [],
    createdBy:   r.created_by ?? null,
    createdAt:   r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubmission(r: any): ScorecardSubmission {
  return {
    id:                r.id,
    agencyId:          r.agency_id,
    templateId:        r.template_id ?? null,
    candidateId:       r.candidate_id,
    jobId:             r.job_id ?? null,
    interviewerId:     r.interviewer_id ?? null,
    interviewerName:   r.users?.full_name ?? null,
    stage:             r.stage ?? null,
    overallRating:     r.overall_rating ?? null,
    recommendation:    r.recommendation ?? null,
    ratings:           r.ratings ?? {},
    notes:             r.notes ?? null,
    pros:              r.pros ?? null,
    cons:              r.cons ?? null,
    submittedVia:      (r.submitted_via ?? "internal") as "internal" | "portal",
    portalClientName:  r.portal_client_name ?? null,
    portalClientEmail: r.portal_client_email ?? null,
    submittedAt:       r.submitted_at ?? null,
    createdAt:         r.created_at,
  };
}

/** Hook: load/manage scorecard templates for an agency (optionally filtered by job) */
export function useScorecardTemplates(jobId?: string | null) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<ScorecardTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let q = supabase.from("scorecard_templates").select("*").order("created_at", { ascending: false });
    if (jobId) q = q.or(`job_id.eq.${jobId},job_id.is.null`);
    q.then(({ data }) => {
      setTemplates((data ?? []).map(mapTemplate));
      setLoading(false);
    });
  }, [jobId]);

  async function createTemplate(input: Omit<ScorecardTemplate, "id" | "agencyId" | "createdAt">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    const { data, error } = await supabase.from("scorecard_templates").insert({
      agency_id:   agencyRow?.agency_id,
      job_id:      input.jobId ?? null,
      name:        input.name,
      description: input.description ?? null,
      criteria:    input.criteria,
      created_by:  user.id,
    }).select().single();
    if (!error && data) setTemplates((prev) => [mapTemplate(data), ...prev]);
  }

  async function updateTemplate(id: string, patch: Partial<Pick<ScorecardTemplate, "name" | "description" | "criteria">>) {
    const { data, error } = await supabase.from("scorecard_templates").update({
      ...(patch.name        !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.criteria    !== undefined && { criteria: patch.criteria }),
    }).eq("id", id).select().single();
    if (!error && data) setTemplates((prev) => prev.map((t) => t.id === id ? mapTemplate(data) : t));
  }

  async function deleteTemplate(id: string) {
    await supabase.from("scorecard_templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return { templates, loading, createTemplate, updateTemplate, deleteTemplate };
}


// ─── Offer Letters ────────────────────────────────────────────────────────────

export interface OfferLetterVariable { key: string; label: string; defaultValue: string; }

export interface OfferLetterTemplate {
  id:          string;
  agencyId:    string;
  name:        string;
  description: string | null;
  body:        string;
  variables:   OfferLetterVariable[];
  isDefault:   boolean;
  createdBy:   string | null;
  createdAt:   string;
}

export type OfferLetterStatus =
  | "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "declined" | "expired";

export interface OfferApprover {
  userId:    string;
  status:    "pending" | "approved" | "rejected";
  decidedAt: string | null;
  comment:   string | null;
}

export interface OfferLetter {
  id:               string;
  agencyId:         string;
  templateId:       string | null;
  candidateId:      string;
  candidateName?:   string;
  jobId:            string | null;
  jobTitle?:        string;
  placementId:      string | null;
  body:             string;
  variables:        Record<string, string>;
  status:           OfferLetterStatus;
  approvers:        OfferApprover[];
  approvedBy:       string | null;
  approvedAt:       string | null;
  rejectionReason:  string | null;
  sentBy:           string | null;
  sentAt:           string | null;
  expiresAt:        string | null;
  candidateResponse: string | null;
  respondedAt:      string | null;
  createdBy:        string | null;
  createdAt:        string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOfferTemplate(r: any): OfferLetterTemplate {
  return {
    id:          r.id,
    agencyId:    r.agency_id,
    name:        r.name,
    description: r.description ?? null,
    body:        r.body,
    variables:   r.variables ?? [],
    isDefault:   r.is_default ?? false,
    createdBy:   r.created_by ?? null,
    createdAt:   r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOfferLetter(r: any): OfferLetter {
  return {
    id:               r.id,
    agencyId:         r.agency_id,
    templateId:       r.template_id ?? null,
    candidateId:      r.candidate_id,
    candidateName:    r.candidates?.full_name ?? undefined,
    jobId:            r.job_id ?? null,
    jobTitle:         r.jobs?.title ?? undefined,
    placementId:      r.placement_id ?? null,
    body:             r.body,
    variables:        r.variables ?? {},
    status:           r.status,
    approvers:        r.approvers ?? [],
    approvedBy:       r.approved_by ?? null,
    approvedAt:       r.approved_at ?? null,
    rejectionReason:  r.rejection_reason ?? null,
    sentBy:           r.sent_by ?? null,
    sentAt:           r.sent_at ?? null,
    expiresAt:        r.expires_at ?? null,
    candidateResponse: r.candidate_response ?? null,
    respondedAt:      r.responded_at ?? null,
    createdBy:        r.created_by ?? null,
    createdAt:        r.created_at,
  };
}

/** Hook: manage offer letter templates */
export function useOfferLetterTemplates() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<OfferLetterTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    supabase.from("offer_letter_templates").select("*").order("is_default", { ascending: false }).order("name")
      .then(({ data }) => { setTemplates((data ?? []).map(mapOfferTemplate)); setLoading(false); });
  }, []);

  async function createTemplate(input: Omit<OfferLetterTemplate, "id" | "agencyId" | "createdAt">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    const { data, error } = await supabase.from("offer_letter_templates").insert({
      agency_id:   agencyRow?.agency_id,
      name:        input.name,
      description: input.description ?? null,
      body:        input.body,
      variables:   input.variables,
      is_default:  input.isDefault,
      created_by:  user.id,
    }).select().single();
    if (!error && data) setTemplates((prev) => [mapOfferTemplate(data), ...prev]);
  }

  async function updateTemplate(id: string, patch: Partial<Omit<OfferLetterTemplate, "id" | "agencyId" | "createdAt">>) {
    const { data, error } = await supabase.from("offer_letter_templates").update({
      ...(patch.name        !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.body        !== undefined && { body: patch.body }),
      ...(patch.variables   !== undefined && { variables: patch.variables }),
      ...(patch.isDefault   !== undefined && { is_default: patch.isDefault }),
    }).eq("id", id).select().single();
    if (!error && data) setTemplates((prev) => prev.map((t) => t.id === id ? mapOfferTemplate(data) : t));
  }

  async function deleteTemplate(id: string) {
    await supabase.from("offer_letter_templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return { templates, loading, createTemplate, updateTemplate, deleteTemplate };
}

/** Hook: manage offer letters (scoped by candidate or job) */
export function useOfferLetters(opts?: { candidateId?: string; jobId?: string }) {
  const supabase = createClient();
  // US-317: React Query keyed on scoping args — dashboard (no scope) shares a
  // single cache entry; scoped calls from candidate/job pages have their own.
  const queryClient = useQueryClient();
  const queryKey    = ["offer-letters", opts?.candidateId ?? null, opts?.jobId ?? null];

  const { data: offers = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async (): Promise<OfferLetter[]> => {
      let q = supabase.from("offer_letters").select("*, candidates(full_name), jobs(title)").order("created_at", { ascending: false });
      if (opts?.candidateId) q = q.eq("candidate_id", opts.candidateId);
      if (opts?.jobId)       q = q.eq("job_id", opts.jobId);
      const { data } = await q;
      return (data ?? []).map(mapOfferLetter);
    },
    staleTime: 30_000,
  });

  const patchCache = (updater: (prev: OfferLetter[]) => OfferLetter[]) => {
    queryClient.setQueryData<OfferLetter[]>(queryKey, (prev) => updater(prev ?? []));
  };

  async function createOffer(input: {
    templateId?:  string | null;
    candidateId:  string;
    jobId?:       string | null;
    placementId?: string | null;
    body:         string;
    variables?:   Record<string, string>;
    expiresAt?:   string | null;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    const { data, error } = await supabase.from("offer_letters").insert({
      agency_id:    agencyRow?.agency_id,
      template_id:  input.templateId ?? null,
      candidate_id: input.candidateId,
      job_id:       input.jobId ?? null,
      placement_id: input.placementId ?? null,
      body:         input.body,
      variables:    input.variables ?? {},
      status:       "draft",
      approvers:    [],
      expires_at:   input.expiresAt ?? null,
      created_by:   user.id,
    }).select("*, candidates(full_name), jobs(title)").single();
    if (error) return { error: error.message };
    const mapped = mapOfferLetter(data);
    patchCache((prev) => [mapped, ...prev]);
    return { offer: mapped };
  }

  async function updateOfferStatus(id: string, status: OfferLetterStatus, extra?: {
    approvedBy?: string; approvedAt?: string; rejectionReason?: string;
    sentBy?: string; sentAt?: string;
    candidateResponse?: string; respondedAt?: string;
  }) {
    const patch: Record<string, unknown> = { status };
    if (extra?.approvedBy)        patch.approved_by       = extra.approvedBy;
    if (extra?.approvedAt)        patch.approved_at       = extra.approvedAt;
    if (extra?.rejectionReason)   patch.rejection_reason  = extra.rejectionReason;
    if (extra?.sentBy)            patch.sent_by           = extra.sentBy;
    if (extra?.sentAt)            patch.sent_at           = extra.sentAt;
    if (extra?.candidateResponse) patch.candidate_response = extra.candidateResponse;
    if (extra?.respondedAt)       patch.responded_at      = extra.respondedAt;
    const { data, error } = await supabase.from("offer_letters")
      .update(patch).eq("id", id).select("*, candidates(full_name), jobs(title)").single();
    if (error) return { error: error.message };
    const mapped = mapOfferLetter(data);
    patchCache((prev) => prev.map((o) => o.id === id ? mapped : o));
    return { offer: mapped };
  }

  async function updateOfferBody(id: string, body: string, variables: Record<string, string>) {
    const { data, error } = await supabase.from("offer_letters")
      .update({ body, variables }).eq("id", id).select("*, candidates(full_name), jobs(title)").single();
    if (error) return { error: error.message };
    const mapped = mapOfferLetter(data);
    patchCache((prev) => prev.map((o) => o.id === id ? mapped : o));
    return { offer: mapped };
  }

  async function deleteOffer(id: string) {
    await supabase.from("offer_letters").delete().eq("id", id);
    patchCache((prev) => prev.filter((o) => o.id !== id));
  }

  return { offers, loading, createOffer, updateOfferStatus, updateOfferBody, deleteOffer };
}

// ─── Fee Models ───────────────────────────────────────────────────────────────

export type FeeType = "percentage" | "flat" | "retained" | "container" | "hybrid";
export type FeeBasis = "first_year_salary" | "total_comp" | "base_salary" | "package";

export interface InvoiceSplit { milestone: string; percentage: number; trigger: string; }

export interface FeeModel {
  id:                string;
  agencyId:          string;
  name:              string;
  description:       string | null;
  feeType:           FeeType;
  percentage:        number | null;
  basis:             FeeBasis | null;
  flatAmount:        number | null;
  currency:          string;
  retainerAmount:    number | null;
  retainerSchedule:  string | null;
  paymentTerms:      string | null;
  splitInvoicing:    boolean;
  invoiceSplits:     InvoiceSplit[];
  guaranteeDays:     number | null;
  replacementTerms:  string | null;
  offLimitsMonths:   number;
  notes:             string | null;
  isDefault:         boolean;
  createdBy:         string | null;
  createdAt:         string;
}

export interface FeeAgreement {
  id:           string;
  agencyId:     string;
  feeModelId:   string | null;
  companyId:    string;
  companyName?: string;
  jobId:        string | null;
  jobTitle?:    string;
  percentage:   number | null;
  flatAmount:   number | null;
  notes:        string | null;
  effectiveFrom: string | null;
  effectiveTo:   string | null;
  signedAt:      string | null;
  createdBy:     string | null;
  createdAt:     string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFeeModel(r: any): FeeModel {
  return {
    id:               r.id,
    agencyId:         r.agency_id,
    name:             r.name,
    description:      r.description ?? null,
    feeType:          r.fee_type,
    percentage:       r.percentage ?? null,
    basis:            r.basis ?? null,
    flatAmount:       r.flat_amount ?? null,
    currency:         r.currency ?? "USD",
    retainerAmount:   r.retainer_amount ?? null,
    retainerSchedule: r.retainer_schedule ?? null,
    paymentTerms:     r.payment_terms ?? null,
    splitInvoicing:   r.split_invoicing ?? false,
    invoiceSplits:    r.invoice_splits ?? [],
    guaranteeDays:    r.guarantee_days ?? null,
    replacementTerms: r.replacement_terms ?? null,
    offLimitsMonths:  r.off_limits_months ?? 12,
    notes:            r.notes ?? null,
    isDefault:        r.is_default ?? false,
    createdBy:        r.created_by ?? null,
    createdAt:        r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFeeAgreement(r: any): FeeAgreement {
  return {
    id:            r.id,
    agencyId:      r.agency_id,
    feeModelId:    r.fee_model_id ?? null,
    companyId:     r.company_id,
    companyName:   r.companies?.name ?? undefined,
    jobId:         r.job_id ?? null,
    jobTitle:      r.jobs?.title ?? undefined,
    percentage:    r.percentage ?? null,
    flatAmount:    r.flat_amount ?? null,
    notes:         r.notes ?? null,
    effectiveFrom: r.effective_from ?? null,
    effectiveTo:   r.effective_to ?? null,
    signedAt:      r.signed_at ?? null,
    createdBy:     r.created_by ?? null,
    createdAt:     r.created_at,
  };
}

/** Hook: manage fee model library */
export function useFeeModels() {
  const supabase = createClient();
  const [models,  setModels]  = useState<FeeModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("fee_models").select("*").order("is_default", { ascending: false }).order("name")
      .then(({ data }) => { setModels((data ?? []).map(mapFeeModel)); setLoading(false); });
  }, []);

  async function createModel(input: Omit<FeeModel, "id" | "agencyId" | "createdAt">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    const { data, error } = await supabase.from("fee_models").insert({
      agency_id:         agencyRow?.agency_id,
      name:              input.name,
      description:       input.description ?? null,
      fee_type:          input.feeType,
      percentage:        input.percentage ?? null,
      basis:             input.basis ?? null,
      flat_amount:       input.flatAmount ?? null,
      currency:          input.currency,
      retainer_amount:   input.retainerAmount ?? null,
      retainer_schedule: input.retainerSchedule ?? null,
      payment_terms:     input.paymentTerms ?? null,
      split_invoicing:   input.splitInvoicing,
      invoice_splits:    input.invoiceSplits,
      guarantee_days:    input.guaranteeDays ?? null,
      replacement_terms: input.replacementTerms ?? null,
      off_limits_months: input.offLimitsMonths,
      notes:             input.notes ?? null,
      is_default:        input.isDefault,
      created_by:        user.id,
    }).select().single();
    if (!error && data) setModels((prev) => [mapFeeModel(data), ...prev]);
    return error ? { error: error.message } : {};
  }

  async function updateModel(id: string, patch: Partial<Omit<FeeModel, "id" | "agencyId" | "createdAt">>) {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name              !== undefined) dbPatch.name              = patch.name;
    if (patch.description       !== undefined) dbPatch.description       = patch.description;
    if (patch.feeType           !== undefined) dbPatch.fee_type          = patch.feeType;
    if (patch.percentage        !== undefined) dbPatch.percentage        = patch.percentage;
    if (patch.basis             !== undefined) dbPatch.basis             = patch.basis;
    if (patch.flatAmount        !== undefined) dbPatch.flat_amount       = patch.flatAmount;
    if (patch.currency          !== undefined) dbPatch.currency          = patch.currency;
    if (patch.retainerAmount    !== undefined) dbPatch.retainer_amount   = patch.retainerAmount;
    if (patch.retainerSchedule  !== undefined) dbPatch.retainer_schedule = patch.retainerSchedule;
    if (patch.paymentTerms      !== undefined) dbPatch.payment_terms     = patch.paymentTerms;
    if (patch.splitInvoicing    !== undefined) dbPatch.split_invoicing   = patch.splitInvoicing;
    if (patch.invoiceSplits     !== undefined) dbPatch.invoice_splits    = patch.invoiceSplits;
    if (patch.guaranteeDays     !== undefined) dbPatch.guarantee_days    = patch.guaranteeDays;
    if (patch.replacementTerms  !== undefined) dbPatch.replacement_terms = patch.replacementTerms;
    if (patch.offLimitsMonths   !== undefined) dbPatch.off_limits_months = patch.offLimitsMonths;
    if (patch.notes             !== undefined) dbPatch.notes             = patch.notes;
    if (patch.isDefault         !== undefined) dbPatch.is_default        = patch.isDefault;
    const { data, error } = await supabase.from("fee_models").update(dbPatch).eq("id", id).select().single();
    if (!error && data) setModels((prev) => prev.map((m) => m.id === id ? mapFeeModel(data) : m));
    return error ? { error: error.message } : {};
  }

  async function deleteModel(id: string) {
    await supabase.from("fee_models").delete().eq("id", id);
    setModels((prev) => prev.filter((m) => m.id !== id));
  }

  return { models, loading, createModel, updateModel, deleteModel };
}

/** Hook: manage fee agreements per client/job */
export function useFeeAgreements(companyId?: string | null) {
  const supabase = createClient();
  const [agreements, setAgreements] = useState<FeeAgreement[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    let q = supabase.from("fee_agreements").select("*, companies(name), jobs(title)").order("created_at", { ascending: false });
    if (companyId) q = q.eq("company_id", companyId);
    q.then(({ data }) => { setAgreements((data ?? []).map(mapFeeAgreement)); setLoading(false); });
  }, [companyId]);

  async function createAgreement(input: Omit<FeeAgreement, "id" | "agencyId" | "createdAt" | "companyName" | "jobTitle">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    const { data, error } = await supabase.from("fee_agreements").insert({
      agency_id:      agencyRow?.agency_id,
      fee_model_id:   input.feeModelId ?? null,
      company_id:     input.companyId,
      job_id:         input.jobId ?? null,
      percentage:     input.percentage ?? null,
      flat_amount:    input.flatAmount ?? null,
      notes:          input.notes ?? null,
      effective_from: input.effectiveFrom ?? null,
      effective_to:   input.effectiveTo ?? null,
      signed_at:      input.signedAt ?? null,
      created_by:     user.id,
    }).select("*, companies(name), jobs(title)").single();
    if (error) return { error: error.message };
    const mapped = mapFeeAgreement(data);
    setAgreements((prev) => [mapped, ...prev]);
    return { agreement: mapped };
  }

  async function deleteAgreement(id: string) {
    await supabase.from("fee_agreements").delete().eq("id", id);
    setAgreements((prev) => prev.filter((a) => a.id !== id));
  }

  return { agreements, loading, createAgreement, deleteAgreement };
}

// ─── usePipelineHealth ────────────────────────────────────────────────────────
// Computes a health score (0-100) for each active job requisition.
// Score factors:
//   - Candidate count (more is better, up to target)
//   - Days since job opened vs. fill date (urgency)
//   - Days since last activity across pipeline entries
//   - Whether job has passed SLA for any stage

export interface JobHealthScore {
  jobId:            string;
  jobTitle:         string;
  companyName:      string;
  score:            number;  // 0–100
  tier:             "healthy" | "at_risk" | "critical";
  signals:          string[];  // human-readable risk factors
  candidateCount:   number;
  daysSinceOpened:  number;
  daysUntilFill:    number | null;
}

function computeHealthScore(
  job:             { id: string; title: string; companyName?: string; createdAt: string; status: string; intake?: Record<string, unknown> },
  candidateCount:  number,
  lastActivityAt?: string | null,
): JobHealthScore {
  let score = 100;
  const signals: string[] = [];
  const now   = Date.now();
  const opened = new Date(job.createdAt).getTime();
  const daysSinceOpened = Math.floor((now - opened) / 86_400_000);

  // Fill date from intake
  const latestFillDate = job.intake?.latestFillDate as string | null | undefined;
  const daysUntilFill  = latestFillDate
    ? Math.floor((new Date(latestFillDate).getTime() - now) / 86_400_000)
    : null;

  // Factor 1: no candidates yet after opening a week
  if (candidateCount === 0 && daysSinceOpened > 7) {
    score -= 30;
    signals.push("No candidates in pipeline");
  } else if (candidateCount < 3 && daysSinceOpened > 14) {
    score -= 15;
    signals.push(`Only ${candidateCount} candidate${candidateCount === 1 ? "" : "s"} after ${daysSinceOpened} days`);
  }

  // Factor 2: approaching fill date
  if (daysUntilFill != null) {
    if (daysUntilFill < 0) {
      score -= 25;
      signals.push(`Past fill date by ${Math.abs(daysUntilFill)} day${Math.abs(daysUntilFill) === 1 ? "" : "s"}`);
    } else if (daysUntilFill <= 7) {
      score -= 20;
      signals.push(`Fill date in ${daysUntilFill} day${daysUntilFill === 1 ? "" : "s"}`);
    } else if (daysUntilFill <= 14) {
      score -= 10;
      signals.push(`Fill date approaching (${daysUntilFill} days)`);
    }
  }

  // Factor 3: no recent activity
  if (lastActivityAt) {
    const daysSinceActivity = Math.floor((now - new Date(lastActivityAt).getTime()) / 86_400_000);
    if (daysSinceActivity > 14) {
      score -= 20;
      signals.push(`No activity in ${daysSinceActivity} days`);
    } else if (daysSinceActivity > 7) {
      score -= 10;
      signals.push(`Low activity (${daysSinceActivity} days)`);
    }
  } else if (daysSinceOpened > 7) {
    score -= 15;
    signals.push("No pipeline activity recorded");
  }

  // Factor 4: job open too long without placement
  if (daysSinceOpened > 90) {
    score -= 10;
    signals.push(`Open for ${daysSinceOpened} days`);
  }

  score = Math.max(0, Math.min(100, score));
  const tier: JobHealthScore["tier"] = score >= 70 ? "healthy" : score >= 40 ? "at_risk" : "critical";

  return {
    jobId:           job.id,
    jobTitle:        job.title,
    companyName:     job.companyName ?? "",
    score,
    tier,
    signals,
    candidateCount,
    daysSinceOpened,
    daysUntilFill,
  };
}

export function usePipelineHealth() {
  const [scores,  setScores]  = useState<JobHealthScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      setLoading(true);

      const [jobsRes, countsRes, activityRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, created_at, status, intake, companies(name)")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        supabase
          .from("candidate_pipeline_entries")
          .select("job_id")
          .eq("status", "active"),
        supabase
          .from("activities")
          .select("entity_id, created_at")
          .eq("entity_type", "job")
          .order("created_at", { ascending: false }),
      ]);

      const countMap: Record<string, number> = {};
      (countsRes.data ?? []).forEach((r: { job_id: string }) => {
        countMap[r.job_id] = (countMap[r.job_id] ?? 0) + 1;
      });

      const lastActivityMap: Record<string, string> = {};
      (activityRes.data ?? []).forEach((r: { entity_id: string; created_at: string }) => {
        if (!lastActivityMap[r.entity_id]) lastActivityMap[r.entity_id] = r.created_at;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const computed = (jobsRes.data ?? []).map((row: any) => computeHealthScore(
        {
          id:          row.id,
          title:       row.title,
          companyName: row.companies?.name ?? "",
          createdAt:   row.created_at,
          status:      row.status,
          intake:      (row.intake as Record<string, unknown>) ?? {},
        },
        countMap[row.id] ?? 0,
        lastActivityMap[row.id] ?? null,
      ));

      // Sort: critical first, then at_risk, then healthy; within tier by score asc
      computed.sort((a, b) => {
        const tierOrder = { critical: 0, at_risk: 1, healthy: 2 };
        const td = tierOrder[a.tier] - tierOrder[b.tier];
        return td !== 0 ? td : a.score - b.score;
      });

      setScores(computed);
      setLoading(false);
    })();
  }, []);

  const atRisk   = scores.filter((s) => s.tier === "at_risk" || s.tier === "critical");
  const critical = scores.filter((s) => s.tier === "critical");

  return { scores, atRisk, critical, loading };
}

// ─── usePods ──────────────────────────────────────────────────────────────────

export interface Pod {
  id:          string;
  agencyId:    string;
  name:        string;
  description: string | null;
  color:       string;
  leadId:      string | null;
  leadName:    string | null;
  memberCount: number;
  members:     { userId: string; fullName: string }[];
  createdAt:   string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPod(row: any): Pod {
  const lead = row.lead ? row.lead : null;
  const members = (row.pod_members ?? []) as Array<{ user_id: string; users: { full_name: string } | null }>;
  return {
    id:          row.id,
    agencyId:    row.agency_id,
    name:        row.name,
    description: row.description ?? null,
    color:       row.color ?? "#6366f1",
    leadId:      row.lead_id ?? null,
    leadName:    lead?.full_name ?? null,
    memberCount: members.length,
    members:     members.map((m) => ({ userId: m.user_id, fullName: m.users?.full_name ?? "Unknown" })),
    createdAt:   row.created_at,
  };
}

export function usePods() {
  const [pods,    setPods]    = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("pods")
      .select("*, lead:lead_id(full_name), pod_members(user_id, users(full_name))")
      .order("name");
    setPods((data ?? []).map(mapPod));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function createPod(name: string, description?: string, color?: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    const { data, error } = await supabase
      .from("pods")
      .insert({ agency_id: agencyRow?.agency_id, name, description: description ?? null, color: color ?? "#6366f1" })
      .select("*, lead:lead_id(full_name), pod_members(user_id, users(full_name))")
      .single();
    if (error) return { error: error.message };
    const pod = mapPod(data);
    setPods((prev) => [...prev, pod].sort((a, b) => a.name.localeCompare(b.name)));
    return { pod };
  }

  async function deletePod(id: string) {
    const supabase = createClient();
    await supabase.from("pods").delete().eq("id", id);
    setPods((prev) => prev.filter((p) => p.id !== id));
  }

  async function addMember(podId: string, userId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("pod_members").insert({ pod_id: podId, user_id: userId });
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function removeMember(podId: string, userId: string) {
    const supabase = createClient();
    await supabase.from("pod_members").delete().eq("pod_id", podId).eq("user_id", userId);
    await refresh();
  }

  async function setLead(podId: string, userId: string | null) {
    const supabase = createClient();
    await supabase.from("pods").update({ lead_id: userId }).eq("id", podId);
    await refresh();
  }

  return { pods, loading, createPod, deletePod, addMember, removeMember, setLead, refresh };
}

// ─── useAlertRules & useAlertEvents ──────────────────────────────────────────

export type AlertTriggerType =
  | "candidate_stale"
  | "sla_breach"
  | "no_submission"
  | "approaching_fill_date"
  | "interview_no_feedback"
  | "offer_expiring"
  | "no_new_candidates"
  | "placement_guarantee_expiring";

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertRule {
  id:             string;
  agencyId:       string;
  name:           string;
  description:    string | null;
  triggerType:    AlertTriggerType;
  conditions:     Record<string, unknown>;
  severity:       AlertSeverity;
  notifyRoles:    string[];
  notifyAssignee: boolean;
  isActive:       boolean;
  createdAt:      string;
}

export interface AlertEvent {
  id:          string;
  agencyId:    string;
  ruleId:      string;
  ruleName:    string;
  entityType:  "candidate" | "job" | "placement" | "pipeline_entry";
  entityId:    string;
  severity:    AlertSeverity;
  message:     string;
  metadata:    Record<string, unknown>;
  dismissed:   boolean;
  createdAt:   string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAlertRule(row: any): AlertRule {
  return {
    id:             row.id,
    agencyId:       row.agency_id,
    name:           row.name,
    description:    row.description ?? null,
    triggerType:    row.trigger_type as AlertTriggerType,
    conditions:     (row.conditions as Record<string, unknown>) ?? {},
    severity:       row.severity as AlertSeverity,
    notifyRoles:    (row.notify_roles as string[]) ?? [],
    notifyAssignee: row.notify_assignee ?? true,
    isActive:       row.is_active ?? true,
    createdAt:      row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAlertEvent(row: any): AlertEvent {
  return {
    id:          row.id,
    agencyId:    row.agency_id,
    ruleId:      row.rule_id,
    ruleName:    row.alert_rules?.name ?? "Unknown rule",
    entityType:  row.entity_type as AlertEvent["entityType"],
    entityId:    row.entity_id,
    severity:    row.severity as AlertSeverity,
    message:     row.message,
    metadata:    (row.metadata as Record<string, unknown>) ?? {},
    dismissed:   row.dismissed ?? false,
    createdAt:   row.created_at,
  };
}

export function useAlertRules() {
  const [rules,   setRules]   = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("alert_rules")
      .select("*")
      .order("name");
    setRules((data ?? []).map(mapAlertRule));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function createRule(input: Omit<AlertRule, "id" | "agencyId" | "createdAt">) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    const { data, error } = await supabase.from("alert_rules").insert({
      agency_id:       agencyRow?.agency_id,
      name:            input.name,
      description:     input.description ?? null,
      trigger_type:    input.triggerType,
      conditions:      input.conditions,
      severity:        input.severity,
      notify_roles:    input.notifyRoles,
      notify_assignee: input.notifyAssignee,
      is_active:       input.isActive,
      created_by:      user.id,
    }).select("*").single();
    if (error) return { error: error.message };
    const rule = mapAlertRule(data);
    setRules((prev) => [...prev, rule].sort((a, b) => a.name.localeCompare(b.name)));
    return { rule };
  }

  async function toggleRule(id: string, isActive: boolean) {
    const supabase = createClient();
    await supabase.from("alert_rules").update({ is_active: isActive }).eq("id", id);
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, isActive } : r));
  }

  async function deleteRule(id: string) {
    const supabase = createClient();
    await supabase.from("alert_rules").delete().eq("id", id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  return { rules, loading, createRule, toggleRule, deleteRule, refresh };
}

export function useAlertEvents(onlyActive = true) {
  const [events,  setEvents]  = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let q = supabase
      .from("alert_events")
      .select("*, alert_rules(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (onlyActive) q = q.eq("dismissed", false) as typeof q;
    const { data } = await q;
    setEvents((data ?? []).map(mapAlertEvent));
    setLoading(false);
  }, [onlyActive]);

  useEffect(() => { refresh(); }, [refresh]);

  // Real-time
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("alert-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alert_events" }, () => { refresh(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alert_events" }, () => { refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  async function dismiss(id: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("alert_events").update({
      dismissed:    true,
      dismissed_by: user?.id ?? null,
      dismissed_at: new Date().toISOString(),
    }).eq("id", id);
    setEvents((prev) => onlyActive ? prev.filter((e) => e.id !== id) : prev.map((e) => e.id === id ? { ...e, dismissed: true } : e));
  }

  async function dismissAll() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const ids = events.filter((e) => !e.dismissed).map((e) => e.id);
    if (!ids.length) return;
    await supabase.from("alert_events").update({
      dismissed:    true,
      dismissed_by: user?.id ?? null,
      dismissed_at: new Date().toISOString(),
    }).in("id", ids);
    setEvents((prev) => onlyActive ? [] : prev.map((e) => ({ ...e, dismissed: true })));
  }

  const activeCount = events.filter((e) => !e.dismissed).length;

  return { events, activeCount, loading, dismiss, dismissAll, refresh };
}

// ─── useAgencyPlan / useFeatureFlag ──────────────────────────────────────────

export function useAgencyPlan() {
  const [plan,      setPlan]      = useState<Plan | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: userRow } = await supabase
        .from("users")
        .select("agency_id")
        .eq("id", user.id)
        .single();
      if (!userRow?.agency_id) { setLoading(false); return; }
      const { data: agency } = await supabase
        .from("agencies")
        .select("plan, feature_overrides")
        .eq("id", userRow.agency_id)
        .single();
      if (agency) {
        setPlan((agency.plan as Plan) ?? "starter");
        setOverrides((agency.feature_overrides as Record<string, boolean>) ?? {});
      }
      setLoading(false);
    })();
  }, []);

  function can(feature: FeatureKey): boolean {
    return hasFeature(plan, feature, overrides);
  }

  return { plan, overrides, loading, can };
}

export function useFeatureFlag(feature: FeatureKey) {
  const { can, loading } = useAgencyPlan();
  return { enabled: can(feature), loading };
}

// ─── useScorecard ─────────────────────────────────────────────────────────────
// Fetches all scorecard submissions for a candidate (agency-side view).

function mapScorecard(row: Record<string, unknown>): ScorecardSubmission {
  const users = row.users as Record<string, unknown> | null;
  return {
    id:                (row.id as string),
    agencyId:          (row.agency_id as string),
    templateId:        (row.template_id as string | null) ?? null,
    candidateId:       (row.candidate_id as string),
    jobId:             (row.job_id as string | null) ?? null,
    interviewerId:     (row.interviewer_id as string | null) ?? null,
    interviewerName:   users ? (users.full_name as string | null) ?? null : null,
    stage:             (row.stage as string | null) ?? null,
    overallRating:     row.overall_rating != null ? Number(row.overall_rating) : null,
    recommendation:    (row.recommendation as ScorecardSubmission["recommendation"]) ?? null,
    ratings:           (row.ratings as Record<string, ScorecardRating>) ?? {},
    notes:             (row.notes as string | null) ?? null,
    pros:              (row.pros as string | null) ?? null,
    cons:              (row.cons as string | null) ?? null,
    submittedVia:      ((row.submitted_via as string) ?? "internal") as "internal" | "portal",
    portalClientName:  (row.portal_client_name as string | null) ?? null,
    portalClientEmail: (row.portal_client_email as string | null) ?? null,
    submittedAt:       (row.submitted_at as string | null) ?? null,
    createdAt:         (row.created_at as string),
  };
}

export function useScorecard(candidateId: string) {
  const [scorecards, setScorecards] = useState<ScorecardSubmission[]>([]);
  const [loading, setLoading]       = useState(true);

  const refresh = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("scorecard_submissions")
      .select("*, users(full_name)")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    setScorecards((data ?? []).map((r) => mapScorecard(r as Record<string, unknown>)));
    setLoading(false);
  }, [candidateId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Real-time: new portal submissions appear instantly
  useEffect(() => {
    if (!candidateId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`scorecards:${candidateId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scorecard_submissions", filter: `candidate_id=eq.${candidateId}` },
        () => { refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [candidateId, refresh]);

  async function deleteScorecard(id: string) {
    const supabase = createClient();
    await supabase.from("scorecard_submissions").delete().eq("id", id);
    setScorecards((prev) => prev.filter((s) => s.id !== id));
  }

  return { scorecards, loading, refresh, deleteScorecard };
}

// ─── Scorecard types & full hooks ────────────────────────────────────────────


interface UpsertScorecardInput {
  templateId:     string | null;
  jobId:          string | null;
  stage:          string | null;
  overallRating:  number | null;
  recommendation: ScorecardRecommendation | null;
  ratings:        Record<string, ScorecardRating>;
  notes:          string | null;
  submit:         boolean;
}

export function useScorecardSubmissions(
  candidateId: string | null | undefined,
  jobId?:      string | null,
) {
  const [submissions, setSubmissions] = useState<ScorecardSubmission[]>([]);
  const [loading, setLoading]         = useState(true);

  const refresh = useCallback(async () => {
    if (!candidateId) { setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    let q = supabase
      .from("scorecard_submissions")
      .select("*, users(full_name)")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    if (jobId) q = q.eq("job_id", jobId) as typeof q;
    const { data } = await q;
    setSubmissions((data ?? []).map((r) => mapScorecard(r as Record<string, unknown>)));
    setLoading(false);
  }, [candidateId, jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Real-time
  useEffect(() => {
    if (!candidateId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`scorecard-subs:${candidateId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scorecard_submissions", filter: `candidate_id=eq.${candidateId}` },
        () => { refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [candidateId, refresh]);

  const avgRating = submissions.filter((s) => s.overallRating != null).length > 0
    ? submissions
        .filter((s) => s.overallRating != null)
        .reduce((sum, s) => sum + (s.overallRating ?? 0), 0) /
      submissions.filter((s) => s.overallRating != null).length
    : null;

  async function upsertSubmission(input: UpsertScorecardInput) {
    if (!candidateId) return { error: "No candidate" };
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };
    const { data: agencyRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!agencyRow?.agency_id) return { error: "No agency" };

    const payload = {
      agency_id:      agencyRow.agency_id,
      candidate_id:   candidateId,
      template_id:    input.templateId ?? null,
      job_id:         input.jobId ?? null,
      interviewer_id: user.id,
      stage:          input.stage ?? null,
      overall_rating: input.overallRating ?? null,
      recommendation: input.recommendation ?? null,
      ratings:        input.ratings,
      notes:          input.notes ?? null,
      submitted_at:   input.submit ? new Date().toISOString() : null,
      submitted_via:  "internal",
    };

    // Try update existing draft first, then insert
    const { data: existing } = await supabase
      .from("scorecard_submissions")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("interviewer_id", user.id)
      .is("submitted_at", null)
      .maybeSingle();

    let result;
    if (existing?.id) {
      result = await supabase
        .from("scorecard_submissions")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*, users(full_name)")
        .single();
    } else {
      result = await supabase
        .from("scorecard_submissions")
        .insert(payload)
        .select("*, users(full_name)")
        .single();
    }

    if (result.error) return { error: result.error.message };
    await refresh();
    return { submission: mapScorecard(result.data as Record<string, unknown>) };
  }

  async function deleteSubmission(id: string) {
    const supabase = createClient();
    await supabase.from("scorecard_submissions").delete().eq("id", id);
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  }

  return { submissions, loading, upsertSubmission, deleteSubmission, avgRating, refresh };
}

// ─── Submission Readiness Checklist (US-027) ──────────────────────────────────

export interface ChecklistItem {
  id: string;
  agencyId: string;
  clientId: string | null;
  jobId: string | null;
  label: string;
  description: string | null;
  category: "general" | "sourcing" | "screening" | "compensation" | "documents" | "references" | "compliance";
  required: boolean;
  sortOrder: number;
  active: boolean;
}

export interface ChecklistCompletion {
  id: string;
  itemId: string;
  jobId: string;
  candidateId: string;
  completedBy: string | null;
  completedAt: string;
  notes: string | null;
}

export interface ChecklistAudit {
  id: string;
  jobId: string;
  candidateId: string;
  submittedAt: string;
  totalItems: number;
  completedItems: number;
  incompleteRequired: { id: string; label: string }[];
  incompleteOptional: { id: string; label: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChecklistItem(row: any): ChecklistItem {
  return {
    id: row.id,
    agencyId: row.agency_id,
    clientId: row.client_id ?? null,
    jobId: row.job_id ?? null,
    label: row.label,
    description: row.description ?? null,
    category: row.category ?? "general",
    required: row.required ?? true,
    sortOrder: row.sort_order ?? 0,
    active: row.active ?? true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCompletion(row: any): ChecklistCompletion {
  return {
    id: row.id,
    itemId: row.item_id,
    jobId: row.job_id,
    candidateId: row.candidate_id,
    completedBy: row.completed_by ?? null,
    completedAt: row.completed_at,
    notes: row.notes ?? null,
  };
}

/**
 * Loads the effective checklist for a job+client combo using three-tier inheritance:
 *   1. Agency defaults (client_id IS NULL, job_id IS NULL)
 *   2. Client overrides  (matching client_id, job_id IS NULL) — add or deactivate
 *   3. Req overrides    (matching job_id)                      — add or deactivate
 *
 * Also loads completions for a specific candidate, so callers can show progress.
 */
export function useSubmissionChecklist(jobId: string, clientId?: string | null, candidateId?: string | null) {
  const [items, setItems]             = useState<ChecklistItem[]>([]);
  const [completions, setCompletions] = useState<ChecklistCompletion[]>([]);
  const [loading, setLoading]         = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    // Load all items scoped to this agency for this job/client
    const { data: allItems } = await supabase
      .from("submission_checklist_items")
      .select("*")
      .eq("active", true)
      .or(`client_id.is.null,client_id.eq.${clientId ?? "00000000-0000-0000-0000-000000000000"}`)
      .or(`job_id.is.null,job_id.eq.${jobId}`)
      .order("sort_order", { ascending: true });

    // Merge: req-level overrides take priority, then client-level, then agency defaults
    // Key = label (normalized), keep highest-specificity item
    const merged = new Map<string, ChecklistItem>();
    const rows: ChecklistItem[] = (allItems ?? []).map(mapChecklistItem);

    // Pass 1: agency defaults
    rows.filter((i) => !i.clientId && !i.jobId).forEach((i) => merged.set(i.label, i));
    // Pass 2: client overrides
    if (clientId) rows.filter((i) => i.clientId === clientId && !i.jobId).forEach((i) => merged.set(i.label, i));
    // Pass 3: req overrides
    rows.filter((i) => i.jobId === jobId).forEach((i) => merged.set(i.label, i));

    setItems([...merged.values()].sort((a, b) => a.sortOrder - b.sortOrder));

    // Load completions for this candidate+job
    if (candidateId) {
      const { data: comps } = await supabase
        .from("submission_checklist_completions")
        .select("*")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId);
      setCompletions((comps ?? []).map(mapCompletion));
    } else {
      setCompletions([]);
    }

    setLoading(false);
  }, [jobId, clientId, candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Mark an item complete for a candidate
  async function completeItem(itemId: string, notes?: string) {
    if (!candidateId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const agencyId = items[0]?.agencyId;
    if (!agencyId) return;
    const { data } = await supabase
      .from("submission_checklist_completions")
      .upsert({
        item_id: itemId,
        job_id: jobId,
        candidate_id: candidateId,
        agency_id: agencyId,
        completed_by: user?.id ?? null,
        notes: notes ?? null,
      }, { onConflict: "item_id,job_id,candidate_id" })
      .select()
      .single();
    if (data) setCompletions((prev) => [...prev.filter((c) => c.itemId !== itemId), mapCompletion(data)]);
  }

  // Uncheck an item
  async function uncompleteItem(itemId: string) {
    if (!candidateId) return;
    const comp = completions.find((c) => c.itemId === itemId);
    if (!comp) return;
    await supabase.from("submission_checklist_completions").delete().eq("id", comp.id);
    setCompletions((prev) => prev.filter((c) => c.itemId !== itemId));
  }

  // Record audit snapshot at submission time
  async function recordAudit(cid: string): Promise<{ blocked: boolean; incompleteRequired: { id: string; label: string }[] }> {
    const completedIds = new Set(completions.map((c) => c.itemId));
    const incompleteRequired = items.filter((i) => i.required && !completedIds.has(i.id)).map((i) => ({ id: i.id, label: i.label }));
    const incompleteOptional = items.filter((i) => !i.required && !completedIds.has(i.id)).map((i) => ({ id: i.id, label: i.label }));
    const agencyId = items[0]?.agencyId;
    if (agencyId) {
      await supabase.from("submission_checklist_audit").insert({
        agency_id: agencyId,
        job_id: jobId,
        candidate_id: cid,
        total_items: items.length,
        completed_items: completions.length,
        incomplete_required: incompleteRequired,
        incomplete_optional: incompleteOptional,
      });
    }
    return { blocked: incompleteRequired.length > 0, incompleteRequired };
  }

  // CRUD for checklist items (settings / onboarding config surface)
  async function addItem(partial: Partial<ChecklistItem> & { label: string }) {
    const agencyId = items[0]?.agencyId;
    if (!agencyId) return;
    const { data } = await supabase
      .from("submission_checklist_items")
      .insert({
        agency_id: agencyId,
        client_id: partial.clientId ?? null,
        job_id: partial.jobId ?? null,
        label: partial.label,
        description: partial.description ?? null,
        category: partial.category ?? "general",
        required: partial.required ?? true,
        sort_order: partial.sortOrder ?? (items.length + 1) * 10,
      })
      .select()
      .single();
    if (data) { setItems((prev) => [...prev, mapChecklistItem(data)].sort((a, b) => a.sortOrder - b.sortOrder)); }
  }

  async function updateItem(id: string, patch: Partial<Omit<ChecklistItem, "id" | "agencyId">>) {
    const { data } = await supabase
      .from("submission_checklist_items")
      .update({
        label: patch.label,
        description: patch.description,
        category: patch.category,
        required: patch.required,
        sort_order: patch.sortOrder,
        active: patch.active,
      })
      .eq("id", id)
      .select()
      .single();
    if (data) setItems((prev) => prev.map((i) => i.id === id ? mapChecklistItem(data) : i));
  }

  async function removeItem(id: string) {
    await supabase.from("submission_checklist_items").update({ active: false }).eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const completedIds  = new Set(completions.map((c) => c.itemId));
  const isComplete    = (itemId: string) => completedIds.has(itemId);
  const requiredCount = items.filter((i) => i.required).length;
  const doneRequired  = items.filter((i) => i.required && completedIds.has(i.id)).length;
  const allRequiredDone = requiredCount === 0 || doneRequired === requiredCount;
  const progressPct   = items.length === 0 ? 100 : Math.round((completions.length / items.length) * 100);

  return {
    items, completions, loading,
    isComplete, allRequiredDone,
    requiredCount, doneRequired, progressPct,
    completeItem, uncompleteItem, recordAudit,
    addItem, updateItem, removeItem,
    refresh: load,
  };
}

/**
 * Agency-level checklist configuration hook (settings surface).
 * No candidate scope — just for managing the item library.
 */
export function useChecklistConfig(clientId?: string | null, jobId?: string | null) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("submission_checklist_items")
      .select("*")
      .order("sort_order", { ascending: true });

    if (clientId) q = q.eq("client_id", clientId);
    else if (jobId) q = q.eq("job_id", jobId);
    else q = q.is("client_id", null).is("job_id", null);

    const { data } = await q;
    setItems((data ?? []).map(mapChecklistItem));
    setLoading(false);
  }, [clientId, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function addItem(label: string, opts?: Partial<ChecklistItem>) {
    const { data } = await supabase
      .from("submission_checklist_items")
      .insert({
        label,
        client_id: clientId ?? null,
        job_id: jobId ?? null,
        category: opts?.category ?? "general",
        required: opts?.required ?? true,
        description: opts?.description ?? null,
        sort_order: (items.length + 1) * 10,
      })
      .select()
      .single();
    if (data) setItems((prev) => [...prev, mapChecklistItem(data)]);
  }

  async function toggleRequired(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    await supabase.from("submission_checklist_items").update({ required: !item.required }).eq("id", id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, required: !i.required } : i));
  }

  async function removeItem(id: string) {
    await supabase.from("submission_checklist_items").update({ active: false }).eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return { items, loading, addItem, toggleRequired, removeItem, refresh: load };
}

// ─── Job Recruiters (US-025) ──────────────────────────────────────────────────

export type RecruiterRole = "lead" | "support" | "sourcer" | "coordinator";

export interface JobRecruiter {
  id:          string;
  jobId:       string;
  userId:      string;
  fullName:    string;
  email?:      string;
  avatarUrl?:  string;
  role:        RecruiterRole;
  assignedAt:  string;
}

export interface AgencyUser {
  id:         string;
  fullName:   string;
  email?:     string;
  avatarUrl?: string;
  role?:      string;
}

export function useAgencyUsers() {
  const [users, setUsers]   = useState<AgencyUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data: row } = await supabase.from("users").select("agency_id").eq("id", user.id).maybeSingle();
      if (!row?.agency_id) { setLoading(false); return; }
      const { data } = await supabase
        .from("users")
        .select("id, full_name, email, avatar_url, role")
        .eq("agency_id", row.agency_id)
        .order("full_name");
      setUsers((data ?? []).map((u) => ({
        id: u.id, fullName: u.full_name ?? u.email ?? "Unknown",
        email: u.email ?? undefined, avatarUrl: u.avatar_url ?? undefined, role: u.role ?? undefined,
      })));
      setLoading(false);
    });
  }, []);

  return { users, loading };
}

/**
 * useJobRecruiters — list, assign, update role, and remove recruiters on a job.
 * Also exposes `agencyUsers` so the assignment picker can show all team members.
 */
export function useJobRecruiters(jobId: string) {
  const [recruiters, setRecruiters]   = useState<JobRecruiter[]>([]);
  const [agencyUsers, setAgencyUsers] = useState<AgencyUser[]>([]);
  const [loading, setLoading]         = useState(true);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);

    // Fetch assignments
    const { data: rows } = await supabase
      .from("job_recruiters")
      .select("id, job_id, user_id, role, assigned_at, users(full_name, email, avatar_url)")
      .eq("job_id", jobId)
      .order("assigned_at", { ascending: true });

    if (rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRecruiters((rows as any[]).map((r): JobRecruiter => ({
        id:          r.id,
        jobId:       r.job_id,
        userId:      r.user_id,
        fullName:    r.users?.full_name ?? "Unknown",
        email:       r.users?.email ?? undefined,
        avatarUrl:   r.users?.avatar_url ?? undefined,
        role:        (r.role ?? "support") as RecruiterRole,
        assignedAt:  r.assigned_at,
      })));
    }

    // Fetch all users in the same agency
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: meRow } = await supabase
        .from("users")
        .select("agency_id")
        .eq("id", user.id)
        .single();

      if (meRow?.agency_id) {
        const { data: teamRows } = await supabase
          .from("users")
          .select("id, full_name, email, avatar_url, role")
          .eq("agency_id", meRow.agency_id)
          .order("full_name");

        if (teamRows) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setAgencyUsers((teamRows as any[]).map((u): AgencyUser => ({
            id:        u.id,
            fullName:  u.full_name ?? "Unknown",
            email:     u.email ?? undefined,
            avatarUrl: u.avatar_url ?? undefined,
            role:      u.role ?? undefined,
          })));
        }
      }
    }

    setLoading(false);
  }, [jobId, supabase]);

  useEffect(() => { load(); }, [load]);

  async function assignRecruiter(userId: string, role: RecruiterRole = "support"): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("job_recruiters")
      .upsert({ job_id: jobId, user_id: userId, role, assigned_by: user?.id }, { onConflict: "job_id,user_id" })
      .select("id, job_id, user_id, role, assigned_at, users(full_name, email, avatar_url)")
      .single();

    if (error || !data) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    const rec: JobRecruiter = {
      id:         r.id,
      jobId:      r.job_id,
      userId:     r.user_id,
      fullName:   r.users?.full_name ?? "Unknown",
      email:      r.users?.email ?? undefined,
      avatarUrl:  r.users?.avatar_url ?? undefined,
      role:       (r.role ?? "support") as RecruiterRole,
      assignedAt: r.assigned_at,
    };

    setRecruiters((prev) => {
      const idx = prev.findIndex((x) => x.userId === userId);
      return idx >= 0 ? prev.map((x, i) => i === idx ? rec : x) : [...prev, rec];
    });
    return true;
  }

  async function updateRole(recruiterId: string, role: RecruiterRole): Promise<void> {
    await supabase.from("job_recruiters").update({ role }).eq("id", recruiterId);
    setRecruiters((prev) => prev.map((r) => r.id === recruiterId ? { ...r, role } : r));
  }

  async function removeRecruiter(recruiterId: string): Promise<void> {
    await supabase.from("job_recruiters").delete().eq("id", recruiterId);
    setRecruiters((prev) => prev.filter((r) => r.id !== recruiterId));
  }

  return { recruiters, agencyUsers, loading, assignRecruiter, updateRole, removeRecruiter, refresh: load };
}

// ─── Off-Limits Rules (US-230) ────────────────────────────────────────────────

export interface OffLimitsRule {
  id:            string;
  agencyId:      string;
  candidateId:   string;
  candidateName: string;
  companyId?:    string;
  companyName?:  string;
  reason?:       string;
  expiresAt?:    string;
  createdAt:     string;
  /** Derived: true if expiresAt is set and is in the past */
  expired:       boolean;
}

export interface NewOffLimitsInput {
  candidateId: string;
  companyId?:  string;  // undefined = all clients
  reason?:     string;
  expiresAt?:  string;
}

/**
 * useOffLimitsRules — full CRUD for off-limits rules.
 * Also exposes `isOffLimits(candidateId, companyId)` for quick checks.
 */
export function useOffLimitsRules() {
  const [rules, setRules]   = useState<OffLimitsRule[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from("off_limits_rules")
      .select(`
        id, agency_id, candidate_id, company_id, reason, expires_at, created_at,
        candidates(first_name, last_name),
        companies(name)
      `)
      .order("created_at", { ascending: false });

    if (data) {
      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRules((data as any[]).map((r): OffLimitsRule => ({
        id:            r.id,
        agencyId:      r.agency_id,
        candidateId:   r.candidate_id,
        candidateName: r.candidates
          ? `${r.candidates.first_name} ${r.candidates.last_name}`
          : "Unknown",
        companyId:     r.company_id ?? undefined,
        companyName:   r.companies?.name ?? undefined,
        reason:        r.reason ?? undefined,
        expiresAt:     r.expires_at ?? undefined,
        createdAt:     r.created_at,
        expired:       r.expires_at ? new Date(r.expires_at) < now : false,
      })));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function addRule(input: NewOffLimitsInput): Promise<OffLimitsRule | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: meRow } = await supabase
      .from("users").select("agency_id").eq("id", user.id).single();
    if (!meRow?.agency_id) return null;

    const { data, error } = await supabase
      .from("off_limits_rules")
      .upsert(
        {
          agency_id:    meRow.agency_id,
          candidate_id: input.candidateId,
          company_id:   input.companyId ?? null,
          reason:       input.reason ?? null,
          expires_at:   input.expiresAt ?? null,
          created_by:   user.id,
        },
        { onConflict: "agency_id,candidate_id,company_id" }
      )
      .select(`
        id, agency_id, candidate_id, company_id, reason, expires_at, created_at,
        candidates(first_name, last_name),
        companies(name)
      `)
      .single();

    if (error || !data) return null;

    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    const rule: OffLimitsRule = {
      id:            r.id,
      agencyId:      r.agency_id,
      candidateId:   r.candidate_id,
      candidateName: r.candidates ? `${r.candidates.first_name} ${r.candidates.last_name}` : "Unknown",
      companyId:     r.company_id ?? undefined,
      companyName:   r.companies?.name ?? undefined,
      reason:        r.reason ?? undefined,
      expiresAt:     r.expires_at ?? undefined,
      createdAt:     r.created_at,
      expired:       r.expires_at ? new Date(r.expires_at) < now : false,
    };

    setRules((prev) => {
      const idx = prev.findIndex((x) => x.id === rule.id);
      return idx >= 0 ? prev.map((x, i) => i === idx ? rule : x) : [rule, ...prev];
    });
    return rule;
  }

  async function removeRule(id: string): Promise<void> {
    await supabase.from("off_limits_rules").delete().eq("id", id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  /**
   * Quick check: is a candidate off-limits for a given company?
   * Returns the matching rule (or undefined if not off-limits).
   * Ignores expired rules.
   */
  function isOffLimits(candidateId: string, companyId: string): OffLimitsRule | undefined {
    const now = new Date();
    return rules.find((r) => {
      if (r.candidateId !== candidateId) return false;
      if (r.expired) return false;
      if (r.expiresAt && new Date(r.expiresAt) < now) return false;
      // Matches if: universal rule (no companyId) OR specific company match
      return !r.companyId || r.companyId === companyId;
    });
  }

  return { rules, loading, addRule, removeRule, isOffLimits, refresh: load };
}

// ─── Business Development Pipeline (US-150) ───────────────────────────────────

export type BdPriority = "low" | "medium" | "high" | "urgent";
export type BdActivityType = "note" | "call" | "email" | "meeting" | "linkedin" | "other";

export interface BdStage {
  id:        string;
  agencyId:  string;
  name:      string;
  position:  number;
  color:     string;
  isWon:     boolean;
  isLost:    boolean;
}

export interface BdOpportunity {
  id:              string;
  agencyId:        string;
  companyId?:      string;
  companyName:     string;
  contactName?:    string;
  contactTitle?:   string;
  contactEmail?:   string;
  contactLinkedin?: string;
  stageId:         string;
  ownerId?:        string;
  ownerName?:      string;
  estimatedValue?: number;
  probability?:    number;
  nextAction?:     string;
  nextActionAt?:   string;
  notes?:          string;
  source?:         string;
  priority:        BdPriority;
  enteredStageAt:  string;
  closedAt?:       string;
  wonAt?:          string;
  createdAt:       string;
  updatedAt:       string;
}

export interface BdActivity {
  id:              string;
  opportunityId:   string;
  agencyId:        string;
  userId?:         string;
  userName?:       string;
  type:            BdActivityType;
  body:            string;
  createdAt:       string;
}

export interface NewBdOpportunityInput {
  companyName:     string;
  companyId?:      string;
  contactName?:    string;
  contactTitle?:   string;
  contactEmail?:   string;
  contactLinkedin?: string;
  stageId:         string;
  estimatedValue?: number;
  probability?:    number;
  nextAction?:     string;
  nextActionAt?:   string;
  notes?:          string;
  source?:         string;
  priority?:       BdPriority;
}

const DEFAULT_BD_STAGES: Omit<BdStage, "id" | "agencyId">[] = [
  { name: "Prospect",  position: 0, color: "#94a3b8", isWon: false, isLost: false },
  { name: "Contacted", position: 1, color: "#60a5fa", isWon: false, isLost: false },
  { name: "Meeting",   position: 2, color: "#818cf8", isWon: false, isLost: false },
  { name: "Proposal",  position: 3, color: "#f59e0b", isWon: false, isLost: false },
  { name: "Engaged",   position: 4, color: "#10b981", isWon: true,  isLost: false },
  { name: "Lost",      position: 5, color: "#f87171", isWon: false, isLost: true  },
];

function mapBdOpp(r: Record<string, unknown>): BdOpportunity {
  return {
    id:              r.id as string,
    agencyId:        r.agency_id as string,
    companyId:       (r.company_id as string | null) ?? undefined,
    companyName:     r.company_name as string,
    contactName:     (r.contact_name as string | null) ?? undefined,
    contactTitle:    (r.contact_title as string | null) ?? undefined,
    contactEmail:    (r.contact_email as string | null) ?? undefined,
    contactLinkedin: (r.contact_linkedin as string | null) ?? undefined,
    stageId:         r.stage_id as string,
    ownerId:         (r.owner_id as string | null) ?? undefined,
    ownerName:       (r.users as { full_name?: string } | null)?.full_name ?? undefined,
    estimatedValue:  (r.estimated_value as number | null) ?? undefined,
    probability:     (r.probability as number | null) ?? undefined,
    nextAction:      (r.next_action as string | null) ?? undefined,
    nextActionAt:    (r.next_action_at as string | null) ?? undefined,
    notes:           (r.notes as string | null) ?? undefined,
    source:          (r.source as string | null) ?? undefined,
    priority:        (r.priority as BdPriority) ?? "medium",
    enteredStageAt:  r.entered_stage_at as string,
    closedAt:        (r.closed_at as string | null) ?? undefined,
    wonAt:           (r.won_at as string | null) ?? undefined,
    createdAt:       r.created_at as string,
    updatedAt:       r.updated_at as string,
  };
}

export function useBdPipeline() {
  const [stages, setStages]   = useState<BdStage[]>([]);
  const [opps, setOpps]       = useState<BdOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const ensureDefaultStages = useCallback(async (agencyId: string): Promise<BdStage[]> => {
    const { data: existing } = await supabase
      .from("bd_stages")
      .select("*")
      .eq("agency_id", agencyId)
      .order("position");

    if (existing && existing.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (existing as any[]).map((s): BdStage => ({
        id:       s.id,
        agencyId: s.agency_id,
        name:     s.name,
        position: s.position,
        color:    s.color,
        isWon:    s.is_won,
        isLost:   s.is_lost,
      }));
    }

    // Seed default stages
    const { data: seeded } = await supabase
      .from("bd_stages")
      .insert(DEFAULT_BD_STAGES.map((s) => ({ ...s, agency_id: agencyId, is_won: s.isWon, is_lost: s.isLost })))
      .select();

    if (!seeded) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (seeded as any[]).map((s): BdStage => ({
      id:       s.id,
      agencyId: s.agency_id,
      name:     s.name,
      position: s.position,
      color:    s.color,
      isWon:    s.is_won,
      isLost:   s.is_lost,
    }));
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: meRow } = await supabase
      .from("users").select("agency_id").eq("id", user.id).single();
    if (!meRow?.agency_id) { setLoading(false); return; }

    const loadedStages = await ensureDefaultStages(meRow.agency_id);
    setStages(loadedStages);

    const { data: oppRows } = await supabase
      .from("bd_opportunities")
      .select("*, users!owner_id(full_name)")
      .eq("agency_id", meRow.agency_id)
      .is("closed_at", null)
      .order("created_at", { ascending: false });

    if (oppRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOpps((oppRows as any[]).map(mapBdOpp));
    }

    setLoading(false);
  }, [supabase, ensureDefaultStages]);

  useEffect(() => { load(); }, [load]);

  async function createOpp(input: NewBdOpportunityInput): Promise<BdOpportunity | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: meRow } = await supabase
      .from("users").select("agency_id").eq("id", user.id).single();
    if (!meRow?.agency_id) return null;

    const { data, error } = await supabase
      .from("bd_opportunities")
      .insert({
        agency_id:       meRow.agency_id,
        company_name:    input.companyName,
        company_id:      input.companyId ?? null,
        contact_name:    input.contactName ?? null,
        contact_title:   input.contactTitle ?? null,
        contact_email:   input.contactEmail ?? null,
        contact_linkedin: input.contactLinkedin ?? null,
        stage_id:        input.stageId,
        owner_id:        user.id,
        estimated_value: input.estimatedValue ?? null,
        probability:     input.probability ?? null,
        next_action:     input.nextAction ?? null,
        next_action_at:  input.nextActionAt ?? null,
        notes:           input.notes ?? null,
        source:          input.source ?? null,
        priority:        input.priority ?? "medium",
      })
      .select("*, users!owner_id(full_name)")
      .single();

    if (error || !data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opp = mapBdOpp(data as any);
    setOpps((prev) => [opp, ...prev]);
    return opp;
  }

  async function moveOpp(oppId: string, newStageId: string): Promise<void> {
    const stage = stages.find((s) => s.id === newStageId);
    await supabase.from("bd_opportunities").update({
      stage_id:         newStageId,
      entered_stage_at: new Date().toISOString(),
      ...(stage?.isWon  ? { won_at:    new Date().toISOString() } : {}),
      ...(stage?.isLost ? { closed_at: new Date().toISOString() } : {}),
    }).eq("id", oppId);

    setOpps((prev) => prev.map((o) =>
      o.id === oppId
        ? { ...o, stageId: newStageId, enteredStageAt: new Date().toISOString() }
        : o
    ));
  }

  async function updateOpp(oppId: string, patch: Partial<NewBdOpportunityInput>): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (patch.companyName    !== undefined) updates.company_name    = patch.companyName;
    if (patch.contactName    !== undefined) updates.contact_name    = patch.contactName;
    if (patch.contactEmail   !== undefined) updates.contact_email   = patch.contactEmail;
    if (patch.estimatedValue !== undefined) updates.estimated_value = patch.estimatedValue;
    if (patch.probability    !== undefined) updates.probability     = patch.probability;
    if (patch.nextAction     !== undefined) updates.next_action     = patch.nextAction;
    if (patch.nextActionAt   !== undefined) updates.next_action_at  = patch.nextActionAt;
    if (patch.notes          !== undefined) updates.notes           = patch.notes;
    if (patch.priority       !== undefined) updates.priority        = patch.priority;

    await supabase.from("bd_opportunities").update(updates).eq("id", oppId);
    setOpps((prev) => prev.map((o) => {
      if (o.id !== oppId) return o;
      return {
        ...o,
        ...(patch.companyName    !== undefined ? { companyName:    patch.companyName }    : {}),
        ...(patch.contactName    !== undefined ? { contactName:    patch.contactName }    : {}),
        ...(patch.contactEmail   !== undefined ? { contactEmail:   patch.contactEmail }   : {}),
        ...(patch.estimatedValue !== undefined ? { estimatedValue: patch.estimatedValue } : {}),
        ...(patch.probability    !== undefined ? { probability:    patch.probability }    : {}),
        ...(patch.nextAction     !== undefined ? { nextAction:     patch.nextAction }     : {}),
        ...(patch.nextActionAt   !== undefined ? { nextActionAt:   patch.nextActionAt }   : {}),
        ...(patch.notes          !== undefined ? { notes:          patch.notes }          : {}),
        ...(patch.priority       !== undefined ? { priority:       patch.priority }       : {}),
      };
    }));
  }

  async function deleteOpp(oppId: string): Promise<void> {
    await supabase.from("bd_opportunities").delete().eq("id", oppId);
    setOpps((prev) => prev.filter((o) => o.id !== oppId));
  }

  async function addActivity(oppId: string, type: BdActivityType, body: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: meRow } = await supabase
      .from("users").select("agency_id").eq("id", user.id).single();
    if (!meRow?.agency_id) return;

    await supabase.from("bd_activities").insert({
      opportunity_id: oppId,
      agency_id:      meRow.agency_id,
      user_id:        user.id,
      type,
      body,
    });
  }

  return { stages, opps, loading, createOpp, moveOpp, updateOpp, deleteOpp, addActivity, refresh: load };
}

// ─── AI Match Scoring (US-110) ────────────────────────────────────────────────

export interface AiMatchScore {
  candidateId: string;
  jobId:       string;
  score:       number;       // 0–100
  percentile?: number;       // percentile rank among all candidates for this job
  computedAt:  string;
}

export interface EmbeddingStatus {
  candidateId:    string;
  hasEmbedding:   boolean;
  generatedAt?:   string;
}

/**
 * useAiMatchScores — returns AI match scores for a specific job.
 * Also exposes `requestEmbedding(candidateId)` which triggers the edge function
 * to generate/refresh the candidate's embedding and recompute scores.
 */
export function useAiMatchScores(jobId: string) {
  const [scores, setScores]   = useState<AiMatchScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<Set<string>>(new Set());

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_match_scores")
      .select("candidate_id, job_id, score, percentile, computed_at")
      .eq("job_id", jobId)
      .order("score", { ascending: false });

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setScores((data as any[]).map((r): AiMatchScore => ({
        candidateId: r.candidate_id,
        jobId:       r.job_id,
        score:       parseFloat(r.score),
        percentile:  r.percentile ? parseFloat(r.percentile) : undefined,
        computedAt:  r.computed_at,
      })));
    }
    setLoading(false);
  }, [jobId, supabase]);

  useEffect(() => { load(); }, [load]);

  /**
   * Trigger embedding generation for a candidate via the edge function.
   * Falls back gracefully if the function is not yet deployed.
   */
  async function requestEmbedding(candidateId: string): Promise<void> {
    setGenerating((prev) => new Set(prev).add(candidateId));
    try {
      // Call the Supabase edge function (deployed separately)
      const { error } = await supabase.functions.invoke("generate-embeddings", {
        body: { candidate_id: candidateId, job_id: jobId },
      });
      if (!error) {
        // Refresh scores after a short delay to let the function complete
        setTimeout(() => load(), 2000);
      }
    } finally {
      setGenerating((prev) => { const s = new Set(prev); s.delete(candidateId); return s; });
    }
  }

  /** Get the score for a specific candidate (undefined if not yet computed). */
  function getScore(candidateId: string): AiMatchScore | undefined {
    return scores.find((s) => s.candidateId === candidateId);
  }

  return { scores, loading, generating, requestEmbedding, getScore, refresh: load };
}

/**
 * useJobMatchScores — returns AI match scores for a specific candidate across all jobs.
 */
export function useCandidateMatchScores(candidateId: string) {
  const [scores, setScores]   = useState<AiMatchScore[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_match_scores")
      .select("candidate_id, job_id, score, percentile, computed_at")
      .eq("candidate_id", candidateId)
      .order("score", { ascending: false });

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setScores((data as any[]).map((r): AiMatchScore => ({
        candidateId: r.candidate_id,
        jobId:       r.job_id,
        score:       parseFloat(r.score),
        percentile:  r.percentile ? parseFloat(r.percentile) : undefined,
        computedAt:  r.computed_at,
      })));
    }
    setLoading(false);
  }, [candidateId, supabase]);

  useEffect(() => { load(); }, [load]);

  return { scores, loading, refresh: load };
}

// ─── Commission Splits (US-100) ───────────────────────────────────────────────

export type CommissionRole = "recruiter" | "sourcer" | "account_manager" | "coordinator" | "lead";
export type PayoutStatus   = "pending" | "approved" | "paid" | "held";

export interface CommissionSplit {
  id:           string;
  agencyId:     string;
  placementId:  string;
  userId:       string;
  userName:     string;
  splitPct:     number;
  amount?:      number;
  role:         CommissionRole;
  payoutStatus: PayoutStatus;
  paidAt?:      string;
  notes?:       string;
  createdAt:    string;
}

export interface NewCommissionSplitInput {
  userId:      string;
  splitPct:    number;
  role?:       CommissionRole;
  notes?:      string;
}

const COMMISSION_ROLE_LABELS: Record<CommissionRole, string> = {
  recruiter:       "Recruiter",
  sourcer:         "Sourcer",
  account_manager: "Account Manager",
  coordinator:     "Coordinator",
  lead:            "Lead",
};

export { COMMISSION_ROLE_LABELS };

export function useCommissionSplits(placementId: string) {
  const [splits, setSplits]   = useState<CommissionSplit[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("commission_splits")
      .select("*, users(full_name)")
      .eq("placement_id", placementId)
      .order("split_pct", { ascending: false });

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSplits((data as any[]).map((r): CommissionSplit => ({
        id:           r.id,
        agencyId:     r.agency_id,
        placementId:  r.placement_id,
        userId:       r.user_id,
        userName:     r.users?.full_name ?? "Unknown",
        splitPct:     parseFloat(r.split_pct),
        amount:       r.amount ? parseFloat(r.amount) : undefined,
        role:         (r.role ?? "recruiter") as CommissionRole,
        payoutStatus: (r.payout_status ?? "pending") as PayoutStatus,
        paidAt:       r.paid_at ?? undefined,
        notes:        r.notes ?? undefined,
        createdAt:    r.created_at,
      })));
    }
    setLoading(false);
  }, [placementId, supabase]);

  useEffect(() => { load(); }, [load]);

  async function addSplit(input: NewCommissionSplitInput, feeAmount?: number): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: meRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!meRow?.agency_id) return false;

    const amount = feeAmount ? (feeAmount * input.splitPct) / 100 : null;

    const { error } = await supabase.from("commission_splits").upsert(
      {
        agency_id:    meRow.agency_id,
        placement_id: placementId,
        user_id:      input.userId,
        split_pct:    input.splitPct,
        amount,
        role:         input.role ?? "recruiter",
        notes:        input.notes ?? null,
      },
      { onConflict: "placement_id,user_id" }
    );
    if (!error) { await load(); }
    return !error;
  }

  async function updatePayoutStatus(splitId: string, status: PayoutStatus): Promise<void> {
    await supabase.from("commission_splits").update({
      payout_status: status,
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
    }).eq("id", splitId);
    setSplits((prev) => prev.map((s) =>
      s.id === splitId ? { ...s, payoutStatus: status, paidAt: status === "paid" ? new Date().toISOString() : s.paidAt } : s
    ));
  }

  async function removeSplit(splitId: string): Promise<void> {
    await supabase.from("commission_splits").delete().eq("id", splitId);
    setSplits((prev) => prev.filter((s) => s.id !== splitId));
  }

  const totalAllocated = splits.reduce((sum, s) => sum + s.splitPct, 0);

  return { splits, loading, totalAllocated, addSplit, updatePayoutStatus, removeSplit, refresh: load };
}

// ─── Placement Guarantees (US-101) ────────────────────────────────────────────

export type GuaranteeStatus     = "active" | "at_risk" | "breached" | "waived" | "cleared";
export type ReplacementStatus   = "open" | "in_progress" | "filled" | "waived" | "expired";

export interface PlacementReplacement {
  id:                      string;
  agencyId:                string;
  originalPlacementId:     string;
  replacementPlacementId?: string;
  candidateLeftAt:         string;
  reason?:                 string;
  replacementStartedAt?:   string;
  replacementDeadline?:    string;
  status:                  ReplacementStatus;
  notes?:                  string;
  createdAt:               string;
}

export function usePlacementGuarantee(placementId: string) {
  const [replacements, setReplacements]   = useState<PlacementReplacement[]>([]);
  const [guaranteeDays, setGuaranteeDays] = useState<number | null>(null);
  const [guaranteeExpires, setGuaranteeExpires] = useState<string | null>(null);
  const [guaranteeStatus, setGuaranteeStatus] = useState<GuaranteeStatus>("active");
  const [loading, setLoading]             = useState(true);

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);

    // Fetch placement guarantee info
    const { data: placement } = await supabase
      .from("placements")
      .select("guarantee_days, guarantee_expires_at, guarantee_status")
      .eq("id", placementId)
      .single();

    if (placement) {
      setGuaranteeDays(placement.guarantee_days ?? null);
      setGuaranteeExpires(placement.guarantee_expires_at ?? null);
      setGuaranteeStatus((placement.guarantee_status ?? "active") as GuaranteeStatus);
    }

    // Fetch replacements
    const { data: repRows } = await supabase
      .from("placement_replacements")
      .select("*")
      .eq("original_placement_id", placementId)
      .order("created_at", { ascending: false });

    if (repRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setReplacements((repRows as any[]).map((r): PlacementReplacement => ({
        id:                      r.id,
        agencyId:                r.agency_id,
        originalPlacementId:     r.original_placement_id,
        replacementPlacementId:  r.replacement_placement_id ?? undefined,
        candidateLeftAt:         r.candidate_left_at,
        reason:                  r.reason ?? undefined,
        replacementStartedAt:    r.replacement_started_at ?? undefined,
        replacementDeadline:     r.replacement_deadline ?? undefined,
        status:                  (r.status ?? "open") as ReplacementStatus,
        notes:                   r.notes ?? undefined,
        createdAt:               r.created_at,
      })));
    }

    setLoading(false);
  }, [placementId, supabase]);

  useEffect(() => { load(); }, [load]);

  async function setGuarantee(days: number, startDate: string): Promise<void> {
    const expiresAt = new Date(new Date(startDate).getTime() + days * 86_400_000).toISOString();
    await supabase.from("placements").update({
      guarantee_days: days,
      guarantee_expires_at: expiresAt,
      guarantee_status: "active",
    }).eq("id", placementId);
    setGuaranteeDays(days);
    setGuaranteeExpires(expiresAt);
    setGuaranteeStatus("active");
  }

  async function flagBreach(reason: string, candidateLeftAt: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: meRow } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!meRow?.agency_id) return;

    await supabase.from("placements").update({ guarantee_status: "breached" }).eq("id", placementId);
    await supabase.from("placement_replacements").insert({
      agency_id:             meRow.agency_id,
      original_placement_id: placementId,
      candidate_left_at:     candidateLeftAt,
      reason,
      status:                "open",
    });
    setGuaranteeStatus("breached");
    await load();
  }

  async function updateReplacementStatus(repId: string, status: ReplacementStatus): Promise<void> {
    await supabase.from("placement_replacements").update({ status }).eq("id", repId);
    setReplacements((prev) => prev.map((r) => r.id === repId ? { ...r, status } : r));
    if (status === "filled") {
      await supabase.from("placements").update({ guarantee_status: "cleared" }).eq("id", placementId);
      setGuaranteeStatus("cleared");
    }
  }

  // Derive: is the guarantee at risk (< 30 days remaining)?
  const daysRemaining = guaranteeExpires
    ? Math.ceil((new Date(guaranteeExpires).getTime() - Date.now()) / 86_400_000)
    : null;

  const isAtRisk = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 30;

  return {
    replacements, guaranteeDays, guaranteeExpires, guaranteeStatus,
    daysRemaining, isAtRisk, loading,
    setGuarantee, flagBreach, updateReplacementStatus, refresh: load,
  };
}

// ─── useSearchMilestones (US-104) ─────────────────────────────────────────────

export type MilestoneStatus = "pending" | "invoiced" | "paid" | "waived";

export interface SearchMilestone {
  id:            string;
  jobId:         string;
  name:          string;
  tranchePct:    number;
  amount:        number | null;
  dueDate:       string | null;
  invoicedAt:    string | null;
  invoiceNumber: string | null;
  paidAt:        string | null;
  status:        MilestoneStatus;
  notes:         string | null;
  sortOrder:     number;
}

export interface NewMilestoneInput {
  name:       string;
  tranchePct: number;
  amount?:    number;
  dueDate?:   string;
  notes?:     string;
  sortOrder?: number;
}

const DEFAULT_MILESTONES: { name: string; tranchePct: number }[] = [
  { name: "Engagement Fee",      tranchePct: 33.33 },
  { name: "Shortlist Delivery",  tranchePct: 33.33 },
  { name: "Placement",           tranchePct: 33.34 },
];

export function useSearchMilestones(jobId: string) {
  const [milestones, setMilestones] = useState<SearchMilestone[]>([]);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("search_milestones")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true });
    if (data) {
      setMilestones(data.map((r): SearchMilestone => ({
        id:            r.id,
        jobId:         r.job_id,
        name:          r.name,
        tranchePct:    parseFloat(r.tranche_pct),
        amount:        r.amount ? parseFloat(r.amount) : null,
        dueDate:       r.due_date ?? null,
        invoicedAt:    r.invoiced_at ?? null,
        invoiceNumber: r.invoice_number ?? null,
        paidAt:        r.paid_at ?? null,
        status:        r.status as MilestoneStatus,
        notes:         r.notes ?? null,
        sortOrder:     r.sort_order,
      })));
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const getAgencyId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    return data?.agency_id ?? null;
  }, []);

  // Seed 3 default tranches if none exist
  const seedDefaults = useCallback(async (retainedFee?: number) => {
    const agencyId = await getAgencyId();
    if (!agencyId) return;
    const supabase = createClient();
    const rows = DEFAULT_MILESTONES.map((m, i) => ({
      agency_id:   agencyId,
      job_id:      jobId,
      name:        m.name,
      tranche_pct: m.tranchePct,
      amount:      retainedFee ? Math.round((retainedFee * m.tranchePct) / 100) : null,
      sort_order:  i,
    }));
    await supabase.from("search_milestones").insert(rows);
    await load();
  }, [jobId, getAgencyId, load]);

  const addMilestone = useCallback(async (input: NewMilestoneInput) => {
    const agencyId = await getAgencyId();
    if (!agencyId) return false;
    const supabase = createClient();
    const { error } = await supabase.from("search_milestones").insert({
      agency_id:   agencyId,
      job_id:      jobId,
      name:        input.name,
      tranche_pct: input.tranchePct,
      amount:      input.amount ?? null,
      due_date:    input.dueDate ?? null,
      notes:       input.notes ?? null,
      sort_order:  input.sortOrder ?? milestones.length,
    });
    if (!error) { await load(); return true; }
    return false;
  }, [jobId, milestones.length, getAgencyId, load]);

  const updateStatus = useCallback(async (
    milestoneId: string,
    status: MilestoneStatus,
    extra?: { invoiceNumber?: string; invoicedAt?: string; paidAt?: string }
  ) => {
    const supabase = createClient();
    const patch: Record<string, string | null> = { status };
    if (status === "invoiced") {
      patch.invoiced_at    = extra?.invoicedAt ?? new Date().toISOString();
      patch.invoice_number = extra?.invoiceNumber ?? null;
    }
    if (status === "paid") {
      patch.paid_at = extra?.paidAt ?? new Date().toISOString();
      if (!patch.invoiced_at) patch.invoiced_at = new Date().toISOString();
    }
    await supabase.from("search_milestones").update(patch).eq("id", milestoneId);
    await load();
  }, [load]);

  const updateMilestone = useCallback(async (milestoneId: string, patch: Partial<NewMilestoneInput>) => {
    const supabase = createClient();
    await supabase.from("search_milestones").update({
      name:        patch.name,
      tranche_pct: patch.tranchePct,
      amount:      patch.amount ?? null,
      due_date:    patch.dueDate ?? null,
      notes:       patch.notes ?? null,
    }).eq("id", milestoneId);
    await load();
  }, [load]);

  const removeMilestone = useCallback(async (milestoneId: string) => {
    const supabase = createClient();
    await supabase.from("search_milestones").delete().eq("id", milestoneId);
    await load();
  }, [load]);

  const totalPct      = milestones.reduce((s, m) => s + m.tranchePct, 0);
  const totalInvoiced = milestones.filter((m) => m.status !== "pending" && m.status !== "waived").reduce((s, m) => s + (m.amount ?? 0), 0);
  const totalPaid     = milestones.filter((m) => m.status === "paid").reduce((s, m) => s + (m.amount ?? 0), 0);

  return {
    milestones, loading, totalPct, totalInvoiced, totalPaid,
    seedDefaults, addMilestone, updateStatus, updateMilestone, removeMilestone, refresh: load,
  };
}

// ─── useTargetAccounts (US-154) ───────────────────────────────────────────────

export type TargetPriority = "tier1" | "tier2" | "tier3";

export interface TargetAccountList {
  id:          string;
  name:        string;
  description: string | null;
  color:       string;
  memberCount: number;
}

export interface TargetAccount {
  companyId:   string;
  companyName: string;
  industry:    string | null;
  priority:    TargetPriority | null;
  note:        string | null;
  addedAt:     string | null;
}

export function useTargetAccounts() {
  const [lists, setLists]   = useState<TargetAccountList[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLists = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("target_account_lists")
      .select("id, name, description, color, target_account_memberships(count)")
      .order("name");
    if (data) {
      setLists(data.map((r) => ({
        id:          r.id,
        name:        r.name,
        description: r.description ?? null,
        color:       r.color ?? "#5461f5",
        memberCount: (r.target_account_memberships as { count: number }[])?.[0]?.count ?? 0,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  const getAgencyId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    return data?.agency_id ?? null;
  }, []);

  const createList = useCallback(async (name: string, description?: string, color?: string) => {
    const agencyId = await getAgencyId();
    if (!agencyId) return null;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("target_account_lists")
      .insert({ agency_id: agencyId, name, description: description ?? null, color: color ?? "#5461f5" })
      .select()
      .single();
    if (!error && data) { await loadLists(); return data.id as string; }
    return null;
  }, [getAgencyId, loadLists]);

  const deleteList = useCallback(async (listId: string) => {
    const supabase = createClient();
    await supabase.from("target_account_lists").delete().eq("id", listId);
    await loadLists();
  }, [loadLists]);

  const addToList = useCallback(async (listId: string, companyId: string) => {
    const supabase = createClient();
    await supabase.from("target_account_memberships").upsert({ list_id: listId, company_id: companyId }, { onConflict: "list_id,company_id" });
    await loadLists();
  }, [loadLists]);

  const removeFromList = useCallback(async (listId: string, companyId: string) => {
    const supabase = createClient();
    await supabase.from("target_account_memberships").delete().eq("list_id", listId).eq("company_id", companyId);
    await loadLists();
  }, [loadLists]);

  const setTargetFlag = useCallback(async (companyId: string, isTarget: boolean, priority?: TargetPriority | null, note?: string) => {
    const supabase = createClient();
    await supabase.from("companies").update({
      is_target_account:  isTarget,
      target_priority:    priority ?? null,
      target_account_note: note ?? null,
      target_added_at:    isTarget ? new Date().toISOString() : null,
    }).eq("id", companyId);
  }, []);

  return { lists, loading, createList, deleteList, addToList, removeFromList, setTargetFlag, refresh: loadLists };
}

export function useTargetAccountMembers(listId: string | null) {
  const [members, setMembers] = useState<TargetAccount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!listId) { setMembers([]); return; }
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("target_account_memberships")
        .select("company_id, added_at, companies(name, industry, is_target_account, target_priority, target_account_note)")
        .eq("list_id", listId)
        .order("added_at", { ascending: false });
      if (data) {
        setMembers(data.map((r): TargetAccount => {
          const raw = r.companies as Record<string, string | null> | Record<string, string | null>[] | null;
          const c = Array.isArray(raw) ? raw[0] ?? null : raw;
          return {
            companyId:   r.company_id,
            companyName: c?.name ?? "—",
            industry:    c?.industry ?? null,
            priority:    (c?.target_priority as TargetPriority | null) ?? null,
            note:        c?.target_account_note ?? null,
            addedAt:     r.added_at ?? null,
          };
        }));
      }
      setLoading(false);
    })();
  }, [listId]);

  return { members, loading };
}

// ─── useClientMsas (US-155) ──────────────────────────────────────────────────

export type MsaStatus = "draft" | "active" | "expired" | "terminated" | "renewed";

export interface ClientMsa {
  id:                string;
  companyId:         string;
  companyName?:      string;
  title:             string;
  signedAt:          string | null;
  effectiveDate:     string | null;
  expiryDate:        string | null;
  autoRenews:        boolean;
  renewalNoticeDays: number;
  status:            MsaStatus;
  feeCap:            number | null;
  exclusivity:       string | null;
  notes:             string | null;
  documentUrl:       string | null;
  daysUntilExpiry:   number | null;
  isExpiringSoon:    boolean;
}

export interface NewMsaInput {
  companyId:         string;
  title?:            string;
  signedAt?:         string;
  effectiveDate?:    string;
  expiryDate?:       string;
  autoRenews?:       boolean;
  renewalNoticeDays?: number;
  feeCap?:           number;
  exclusivity?:      string;
  notes?:            string;
  documentUrl?:      string;
}

export function useClientMsas(companyId?: string) {
  const [msas, setMsas]     = useState<ClientMsa[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let q = supabase
      .from("client_msas")
      .select("*, companies(name)")
      .order("expiry_date", { ascending: true, nullsFirst: false });
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    if (data) {
      const now = Date.now();
      setMsas(data.map((r): ClientMsa => {
        const expiry = r.expiry_date ? new Date(r.expiry_date).getTime() : null;
        const days   = expiry !== null ? Math.ceil((expiry - now) / 86_400_000) : null;
        const notice = r.renewal_notice_days ?? 60;
        return {
          id:                r.id,
          companyId:         r.company_id,
          companyName:       (r.companies as { name: string } | null)?.name,
          title:             r.title,
          signedAt:          r.signed_at ?? null,
          effectiveDate:     r.effective_date ?? null,
          expiryDate:        r.expiry_date ?? null,
          autoRenews:        r.auto_renews ?? false,
          renewalNoticeDays: notice,
          status:            r.status as MsaStatus,
          feeCap:            r.fee_cap ? parseFloat(r.fee_cap) : null,
          exclusivity:       r.exclusivity ?? null,
          notes:             r.notes ?? null,
          documentUrl:       r.document_url ?? null,
          daysUntilExpiry:   days,
          isExpiringSoon:    days !== null && days >= 0 && days <= notice,
        };
      }));
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const getAgencyId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    return data?.agency_id ?? null;
  }, []);

  const createMsa = useCallback(async (input: NewMsaInput) => {
    const agencyId = await getAgencyId();
    if (!agencyId) return false;
    const supabase = createClient();
    const { error } = await supabase.from("client_msas").insert({
      agency_id:          agencyId,
      company_id:         input.companyId,
      title:              input.title ?? "Master Service Agreement",
      signed_at:          input.signedAt ?? null,
      effective_date:     input.effectiveDate ?? null,
      expiry_date:        input.expiryDate ?? null,
      auto_renews:        input.autoRenews ?? false,
      renewal_notice_days: input.renewalNoticeDays ?? 60,
      fee_cap:            input.feeCap ?? null,
      exclusivity:        input.exclusivity ?? null,
      notes:              input.notes ?? null,
      document_url:       input.documentUrl ?? null,
    });
    if (!error) { await load(); return true; }
    return false;
  }, [getAgencyId, load]);

  const updateMsa = useCallback(async (msaId: string, patch: Partial<NewMsaInput> & { status?: MsaStatus }) => {
    const supabase = createClient();
    await supabase.from("client_msas").update({
      title:              patch.title,
      signed_at:          patch.signedAt,
      effective_date:     patch.effectiveDate,
      expiry_date:        patch.expiryDate,
      auto_renews:        patch.autoRenews,
      renewal_notice_days: patch.renewalNoticeDays,
      fee_cap:            patch.feeCap,
      exclusivity:        patch.exclusivity,
      notes:              patch.notes,
      document_url:       patch.documentUrl,
      status:             patch.status,
    }).eq("id", msaId);
    await load();
  }, [load]);

  const deleteMsa = useCallback(async (msaId: string) => {
    const supabase = createClient();
    await supabase.from("client_msas").delete().eq("id", msaId);
    await load();
  }, [load]);

  const expiringCount = msas.filter((m) => m.isExpiringSoon && m.status === "active").length;
  const expiredCount  = msas.filter((m) => m.status === "expired").length;

  return { msas, loading, expiringCount, expiredCount, createMsa, updateMsa, deleteMsa, refresh: load };
}

// ─── US-344: Candidate Consent Management ────────────────────────────────────

export type ConsentType =
  | "data_processing"
  | "marketing_email"
  | "sms"
  | "portal_sharing"
  | "enrichment"
  | "ai_processing"
  | "third_party_ats";

export interface CandidateConsent {
  id: string;
  candidateId: string;
  consentType: ConsentType;
  granted: boolean;
  legalBasis: string | null;
  evidenceText: string | null;
  grantedAt: string;
  withdrawnAt: string | null;
}

export function useCandidateConsents(candidateId: string) {
  const [consents, setConsents] = useState<CandidateConsent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!candidateId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("candidate_consents")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("consent_type");
    setConsents(
      (data ?? []).map((r: any) => ({
        id: r.id,
        candidateId: r.candidate_id,
        consentType: r.consent_type as ConsentType,
        granted: r.granted,
        legalBasis: r.legal_basis ?? null,
        evidenceText: r.evidence_text ?? null,
        grantedAt: r.granted_at,
        withdrawnAt: r.withdrawn_at ?? null,
      }))
    );
    setLoading(false);
  }, [candidateId]);

  useEffect(() => { load(); }, [load]);

  const grantConsent = useCallback(async (
    consentType: ConsentType,
    legalBasis?: string,
    evidenceText?: string
  ) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;

    await supabase.from("candidate_consents").upsert(
      {
        candidate_id: candidateId,
        agency_id: ctx.agencyId,
        consent_type: consentType,
        granted: true,
        legal_basis: legalBasis ?? "consent",
        evidence_text: evidenceText ?? null,
        granted_by: ctx.userId,
        granted_at: new Date().toISOString(),
        withdrawn_at: null,
      },
      { onConflict: "candidate_id,consent_type" }
    );
    await load();
  }, [candidateId, load]);

  const withdrawConsent = useCallback(async (consentType: ConsentType) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;

    await supabase.from("candidate_consents")
      .update({ granted: false, withdrawn_at: new Date().toISOString() })
      .eq("candidate_id", candidateId)
      .eq("consent_type", consentType);
    await load();
  }, [candidateId, load]);

  const grantedCount  = consents.filter(c => c.granted).length;
  const withdrawnCount = consents.filter(c => !c.granted).length;

  return { consents, loading, grantConsent, withdrawConsent, grantedCount, withdrawnCount, refresh: load };
}

// ─── US-345: DSAR Workflow ───────────────────────────────────────────────────

export type DsarType = "access" | "rectification" | "erasure" | "restriction" | "portability" | "objection";
export type DsarStatus = "pending" | "in_progress" | "fulfilled" | "denied" | "withdrawn";

export interface Dsar {
  id: string;
  agencyId: string;
  candidateId: string | null;
  requestType: DsarType;
  status: DsarStatus;
  requesterName: string;
  requesterEmail: string;
  slaDeadline: string;
  internalNotes: string | null;
  denialReason: string | null;
  assignedTo: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

export function useDsars() {
  const [dsars, setDsars] = useState<Dsar[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("dsars")
      .select("*")
      .not("status", "in", '("fulfilled","denied","withdrawn")')
      .order("sla_deadline", { ascending: true });
    setDsars(
      (data ?? []).map((r: any) => ({
        id: r.id,
        agencyId: r.agency_id,
        candidateId: r.candidate_id ?? null,
        requestType: r.request_type as DsarType,
        status: r.status as DsarStatus,
        requesterName: r.requester_name,
        requesterEmail: r.requester_email,
        slaDeadline: r.sla_deadline,
        internalNotes: r.internal_notes ?? null,
        denialReason: r.denial_reason ?? null,
        assignedTo: r.assigned_to ?? null,
        fulfilledAt: r.fulfilled_at ?? null,
        createdAt: r.created_at,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createDsar = useCallback(async (input: {
    requestType: DsarType;
    requesterName: string;
    requesterEmail: string;
    candidateId?: string;
    internalNotes?: string;
  }) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("dsars").insert({
      agency_id: ctx.agencyId,
      request_type: input.requestType,
      requester_name: input.requesterName,
      requester_email: input.requesterEmail,
      candidate_id: input.candidateId ?? null,
      internal_notes: input.internalNotes ?? null,
    });
    await load();
  }, [load]);

  const updateDsarStatus = useCallback(async (
    id: string,
    status: DsarStatus,
    opts?: { denialReason?: string; notes?: string }
  ) => {
    const supabase = createClient();
    await supabase.from("dsars").update({
      status,
      ...(status === "fulfilled" ? { fulfilled_at: new Date().toISOString() } : {}),
      ...(opts?.denialReason ? { denial_reason: opts.denialReason } : {}),
      ...(opts?.notes ? { internal_notes: opts.notes } : {}),
    }).eq("id", id);
    await load();
  }, [load]);

  const overdueCount = dsars.filter(d =>
    d.status === "pending" && new Date(d.slaDeadline) < new Date()
  ).length;

  return { dsars, loading, overdueCount, createDsar, updateDsarStatus, refresh: load };
}

// ─── US-486 + US-490 + US-488 + US-489 + US-494: Search Enhancements ────────

export interface SearchHistoryEntry {
  id: string;
  query: string;
  filters: Record<string, unknown>;
  resultCount: number;
  searchType: "keyword" | "boolean" | "semantic" | "nl_talent";
  ranAt: string;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("search_history")
      .select("id, query, filters, result_count, search_type, ran_at")
      .order("ran_at", { ascending: false })
      .limit(20);
    setHistory(
      (data ?? []).map((r: { id: string; query: string; filters: Record<string, unknown>; result_count: number; search_type: "keyword" | "boolean" | "semantic" | "nl_talent"; ran_at: string }) => ({
        id: r.id,
        query: r.query,
        filters: r.filters ?? {},
        resultCount: r.result_count,
        searchType: r.search_type,
        ranAt: r.ran_at,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const recordSearch = useCallback(async (
    query: string,
    filters: Record<string, unknown>,
    resultCount: number,
    searchType: SearchHistoryEntry["searchType"] = "keyword"
  ) => {
    if (!query.trim() && Object.keys(filters).length === 0) return;
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("search_history").insert({
      agency_id: ctx.agencyId,
      query,
      filters,
      result_count: resultCount,
      search_type: searchType,
    });
    await load();
  }, [load]);

  const clearHistory = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("search_history").delete().eq("user_id", user.id);
    setHistory([]);
  }, []);

  return { history, loading, recordSearch, clearHistory, refresh: load };
}

export interface UserSearchDefaults {
  status?: string;
  source?: string;
  tags?: string[];
  sort?: string;
}

export function useUserSearchDefaults() {
  const [defaults, setDefaults] = useState<UserSearchDefaults>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_search_defaults")
        .select("defaults")
        .maybeSingle();
      setDefaults((data?.defaults as UserSearchDefaults) ?? {});
      setLoading(false);
    })();
  }, []);

  const saveDefaults = useCallback(async (values: UserSearchDefaults) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_search_defaults").upsert({
      user_id: user.id,
      agency_id: ctx.agencyId,
      defaults: values,
    }, { onConflict: "user_id" });
    setDefaults(values);
  }, []);

  return { defaults, loading, saveDefaults };
}

export interface SearchResultFeedback {
  id: string;
  candidateId: string;
  jobId: string | null;
  querySnapshot: string;
  signal: "thumbs_up" | "thumbs_down";
  note: string | null;
  createdAt: string;
}

export function useSearchResultFeedback() {
  const [feedbacks, setFeedbacks] = useState<SearchResultFeedback[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("search_result_feedback")
      .select("id, candidate_id, job_id, query_snapshot, signal, note, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setFeedbacks(
      (data ?? []).map((r: { id: string; candidate_id: string; job_id: string | null; query_snapshot: string; signal: "thumbs_up" | "thumbs_down"; note: string | null; created_at: string }) => ({
        id: r.id,
        candidateId: r.candidate_id,
        jobId: r.job_id,
        querySnapshot: r.query_snapshot,
        signal: r.signal,
        note: r.note,
        createdAt: r.created_at,
      }))
    );
  }, []);

  useEffect(() => { load(); }, [load]);

  const giveFeedback = useCallback(async (
    candidateId: string,
    signal: "thumbs_up" | "thumbs_down",
    querySnapshot: string,
    jobId?: string,
    note?: string
  ) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("search_result_feedback").upsert({
      agency_id: ctx.agencyId,
      candidate_id: candidateId,
      job_id: jobId ?? null,
      query_snapshot: querySnapshot,
      signal,
      note: note ?? null,
    }, { onConflict: "user_id,candidate_id,job_id" });
    await load();
  }, [load]);

  const removeFeedback = useCallback(async (id: string) => {
    const supabase = createClient();
    await supabase.from("search_result_feedback").delete().eq("id", id);
    setFeedbacks((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const feedbackMap = feedbacks.reduce<Record<string, "thumbs_up" | "thumbs_down">>((acc, f) => {
    acc[f.candidateId] = f.signal;
    return acc;
  }, {});

  return { feedbacks, feedbackMap, giveFeedback, removeFeedback };
}

export function useSearchSignals() {
  const recordSignal = useCallback(async (
    candidateId: string,
    signalType: "view" | "shortlist_add" | "email_sent" | "skip" | "profile_open",
    querySnapshot: string,
    position?: number,
    jobId?: string
  ) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("search_signals").insert({
      agency_id: ctx.agencyId,
      candidate_id: candidateId,
      job_id: jobId ?? null,
      query_snapshot: querySnapshot,
      signal_type: signalType,
      position: position ?? null,
    });
  }, []);

  return { recordSignal };
}

// ─── US-201: Offer Rounds ─────────────────────────────────────────────────────

export interface OfferRound {
  id: string;
  offerLetterId: string;
  candidateId: string;
  jobId: string;
  roundNumber: number;
  roundType: "initial" | "counter_candidate" | "counter_client" | "revised" | "accepted" | "rejected" | "withdrawn";
  baseSalary: number | null;
  bonus: number | null;
  equityNotes: string | null;
  startDate: string | null;
  otherTerms: string | null;
  submittedBy: "recruiter" | "candidate" | "client";
  notes: string | null;
  createdAt: string;
}

export function useOfferRounds(offerLetterId: string | null | undefined) {
  const [rounds, setRounds] = useState<OfferRound[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!offerLetterId) { setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("offer_rounds")
      .select("*")
      .eq("offer_letter_id", offerLetterId)
      .order("round_number", { ascending: true });
    setRounds(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((r: any) => ({
        id: r.id,
        offerLetterId: r.offer_letter_id,
        candidateId: r.candidate_id,
        jobId: r.job_id,
        roundNumber: r.round_number,
        roundType: r.round_type,
        baseSalary: r.base_salary,
        bonus: r.bonus,
        equityNotes: r.equity_notes,
        startDate: r.start_date,
        otherTerms: r.other_terms,
        submittedBy: r.submitted_by,
        notes: r.notes,
        createdAt: r.created_at,
      }))
    );
    setLoading(false);
  }, [offerLetterId]);

  useEffect(() => { load(); }, [load]);

  const addRound = useCallback(async (input: Omit<OfferRound, "id" | "createdAt" | "roundNumber"> & { roundNumber?: number }) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    const nextRound = (rounds[rounds.length - 1]?.roundNumber ?? 0) + 1;
    await supabase.from("offer_rounds").insert({
      agency_id: ctx.agencyId,
      offer_letter_id: input.offerLetterId,
      candidate_id: input.candidateId,
      job_id: input.jobId,
      round_number: input.roundNumber ?? nextRound,
      round_type: input.roundType,
      base_salary: input.baseSalary,
      bonus: input.bonus,
      equity_notes: input.equityNotes,
      start_date: input.startDate,
      other_terms: input.otherTerms,
      submitted_by: input.submittedBy,
      notes: input.notes,
    });
    await load();
  }, [rounds, load]);

  return { rounds, loading, addRound, refresh: load };
}

// ─── US-202: Closing Playbook ─────────────────────────────────────────────────

export interface PlaybookStep {
  id: string;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  note: string | null;
}

export interface ClosingPlaybookInstance {
  id: string;
  jobId: string;
  candidateId: string;
  steps: PlaybookStep[];
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PLAYBOOK_STEPS: Omit<PlaybookStep, "completed" | "completedAt" | "completedBy" | "note">[] = [
  { id: "ref_check",       title: "Complete reference checks",           description: "At least 2 professional references",                required: true  },
  { id: "counter_coach",   title: "Counter-offer coaching",             description: "Prepare candidate for likely counter from current employer", required: true  },
  { id: "start_confirm",   title: "Confirm start date with client",      description: "Lock in start date and onboarding plan",            required: true  },
  { id: "offer_letter",    title: "Offer letter signed",                description: "Signed letter on file",                              required: true  },
  { id: "resignation",     title: "Resignation submitted",              description: "Candidate has resigned from current role",           required: false },
  { id: "notice_period",   title: "Notice period confirmed",            description: "Verify notice period and any garden leave",          required: false },
  { id: "pre_boarding",    title: "Pre-boarding check-in",              description: "Check in 1 week before start date",                  required: false },
  { id: "day1_confirm",    title: "Day 1 start confirmed",              description: "Confirm candidate started successfully",             required: true  },
];

export function useClosingPlaybook(jobId: string, candidateId: string) {
  const [instance, setInstance] = useState<ClosingPlaybookInstance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!jobId || !candidateId) { setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("closing_playbook_instances")
      .select("*")
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .maybeSingle();
    if (data) {
      setInstance({
        id: data.id,
        jobId: data.job_id,
        candidateId: data.candidate_id,
        steps: data.steps as PlaybookStep[],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    } else {
      setInstance(null);
    }
    setLoading(false);
  }, [jobId, candidateId]);

  useEffect(() => { load(); }, [load]);

  const initPlaybook = useCallback(async () => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    const steps: PlaybookStep[] = DEFAULT_PLAYBOOK_STEPS.map((s) => ({
      ...s,
      completed: false,
      completedAt: null,
      completedBy: null,
      note: null,
    }));
    await supabase.from("closing_playbook_instances").upsert({
      agency_id: ctx.agencyId,
      job_id: jobId,
      candidate_id: candidateId,
      steps,
    }, { onConflict: "job_id,candidate_id" });
    await load();
  }, [jobId, candidateId, load]);

  const toggleStep = useCallback(async (stepId: string, note?: string) => {
    if (!instance) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const updatedSteps = instance.steps.map((s) => {
      if (s.id !== stepId) return s;
      const completing = !s.completed;
      return {
        ...s,
        completed: completing,
        completedAt: completing ? now : null,
        completedBy: completing ? (user?.email ?? null) : null,
        note: note ?? s.note,
      };
    });
    await supabase.from("closing_playbook_instances")
      .update({ steps: updatedSteps })
      .eq("id", instance.id);
    setInstance({ ...instance, steps: updatedSteps });
  }, [instance]);

  const completedCount = instance?.steps.filter((s) => s.completed).length ?? 0;
  const totalCount = instance?.steps.length ?? 0;

  return { instance, loading, initPlaybook, toggleStep, completedCount, totalCount };
}

// ─── US-221: Client SLA Config ────────────────────────────────────────────────

export interface ClientSlaConfig {
  id: string;
  companyId: string;
  submittralDays: number;
  clientResponseDays: number;
  offerDecisionDays: number;
  alertOnBreach: boolean;
  notes: string | null;
}

export function useClientSlaConfig(companyId: string | null | undefined) {
  const [config, setConfig] = useState<ClientSlaConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("client_sla_config")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    setConfig(data ? {
      id: data.id,
      companyId: data.company_id,
      submittralDays: data.submittal_days,
      clientResponseDays: data.client_response_days,
      offerDecisionDays: data.offer_decision_days,
      alertOnBreach: data.alert_on_breach,
      notes: data.notes,
    } : null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const saveConfig = useCallback(async (input: Partial<Omit<ClientSlaConfig, "id" | "companyId">>) => {
    if (!companyId) return;
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("client_sla_config").upsert({
      agency_id: ctx.agencyId,
      company_id: companyId,
      submittal_days: input.submittralDays ?? 5,
      client_response_days: input.clientResponseDays ?? 3,
      offer_decision_days: input.offerDecisionDays ?? 10,
      alert_on_breach: input.alertOnBreach ?? true,
      notes: input.notes ?? null,
    }, { onConflict: "agency_id,company_id" });
    await load();
  }, [companyId, load]);

  return { config, loading, saveConfig };
}

// ─── US-156: Client Health Scores ────────────────────────────────────────────

export interface ClientHealthScore {
  id: string;
  companyId: string;
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  activeRolesScore: number;
  placementScore: number;
  engagementScore: number;
  revenueScore: number;
  activeRoleCount: number;
  placements12mo: number;
  daysSinceContact: number | null;
  revenue12mo: number;
  lastPlacementDate: string | null;
  scoreDelta: number;
  riskFlags: string[];
  computedAt: string;
}

export function useClientHealthScores() {
  const [scores, setScores] = useState<ClientHealthScore[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("client_health_scores")
      .select("*")
      .order("score", { ascending: true });
    setScores(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((r: any) => ({
        id: r.id,
        companyId: r.company_id,
        score: r.score,
        riskLevel: r.risk_level,
        activeRolesScore: r.active_roles_score,
        placementScore: r.placement_score,
        engagementScore: r.engagement_score,
        revenueScore: r.revenue_score,
        activeRoleCount: r.active_role_count,
        placements12mo: r.placements_12mo,
        daysSinceContact: r.days_since_contact,
        revenue12mo: Number(r.revenue_12mo ?? 0),
        lastPlacementDate: r.last_placement_date,
        scoreDelta: r.score_delta,
        riskFlags: r.risk_flags ?? [],
        computedAt: r.computed_at,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsertScore = useCallback(async (companyId: string, input: Partial<Omit<ClientHealthScore, "id" | "companyId" | "computedAt">>) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("client_health_scores").upsert({
      agency_id: ctx.agencyId,
      company_id: companyId,
      ...input,
      computed_at: new Date().toISOString(),
    }, { onConflict: "agency_id,company_id" });
    await load();
  }, [load]);

  return { scores, loading, upsertScore, refresh: load };
}

// ─── US-158: BD Win/Loss ──────────────────────────────────────────────────────

export interface BdWinLossTag {
  id: string;
  opportunityId: string;
  outcome: "won" | "lost" | "no_decision" | "stalled";
  reasonCategory: string;
  reasonDetail: string | null;
  competitor: string | null;
  createdAt: string;
}

export function useBdWinLoss(opportunityId?: string) {
  const [tags, setTags] = useState<BdWinLossTag[]>([]);
  const [tag, setTag] = useState<BdWinLossTag | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    if (opportunityId) {
      const { data } = await supabase
        .from("bd_win_loss_tags")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .maybeSingle();
      setTag(data ? {
        id: data.id, opportunityId: data.opportunity_id, outcome: data.outcome,
        reasonCategory: data.reason_category, reasonDetail: data.reason_detail,
        competitor: data.competitor, createdAt: data.created_at,
      } : null);
    } else {
      const { data } = await supabase
        .from("bd_win_loss_tags")
        .select("*")
        .order("created_at", { ascending: false });
      setTags(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data ?? []).map((r: any) => ({
          id: r.id, opportunityId: r.opportunity_id, outcome: r.outcome,
          reasonCategory: r.reason_category, reasonDetail: r.reason_detail,
          competitor: r.competitor, createdAt: r.created_at,
        }))
      );
    }
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => { load(); }, [load]);

  const saveTag = useCallback(async (
    oppId: string,
    outcome: BdWinLossTag["outcome"],
    reasonCategory: string,
    reasonDetail?: string,
    competitor?: string
  ) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("bd_win_loss_tags").upsert({
      agency_id: ctx.agencyId,
      opportunity_id: oppId,
      outcome,
      reason_category: reasonCategory,
      reason_detail: reasonDetail ?? null,
      competitor: competitor ?? null,
    }, { onConflict: "opportunity_id" });
    await load();
  }, [load]);

  return { tags, tag, loading, saveTag };
}

// ─── US-159: Referrals ────────────────────────────────────────────────────────

export interface Referral {
  id: string;
  referralType: "candidate" | "client";
  referredByType: "candidate" | "client" | "employee" | "other";
  referredByName: string;
  referredName: string | null;
  status: "pending" | "contacted" | "converted" | "declined" | "expired";
  rewardDescription: string | null;
  rewardIssued: boolean;
  notes: string | null;
  createdAt: string;
}

export function useReferrals() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("referrals")
      .select("*")
      .order("created_at", { ascending: false });
    setReferrals(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((r: any) => ({
        id: r.id,
        referralType: r.referral_type,
        referredByType: r.referred_by_type,
        referredByName: r.referred_by_name,
        referredName: r.referred_name,
        status: r.status,
        rewardDescription: r.reward_description,
        rewardIssued: r.reward_issued,
        notes: r.notes,
        createdAt: r.created_at,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addReferral = useCallback(async (input: Omit<Referral, "id" | "createdAt" | "status" | "rewardIssued">) => {
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("referrals").insert({
      agency_id: ctx.agencyId,
      referral_type: input.referralType,
      referred_by_type: input.referredByType,
      referred_by_name: input.referredByName,
      referred_name: input.referredName,
      status: "pending",
      reward_description: input.rewardDescription,
      reward_issued: false,
      notes: input.notes,
    });
    await load();
  }, [load]);

  const updateStatus = useCallback(async (id: string, status: Referral["status"]) => {
    const supabase = createClient();
    await supabase.from("referrals").update({
      status,
      ...(status === "converted" ? { converted_at: new Date().toISOString() } : {}),
    }).eq("id", id);
    setReferrals((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  }, []);

  const markRewardIssued = useCallback(async (id: string) => {
    const supabase = createClient();
    await supabase.from("referrals").update({
      reward_issued: true,
      reward_issued_at: new Date().toISOString(),
    }).eq("id", id);
    setReferrals((prev) => prev.map((r) => r.id === id ? { ...r, rewardIssued: true } : r));
  }, []);

  return { referrals, loading, addReferral, updateStatus, markRewardIssued };
}

// ─── US-481: Company Enrichment ───────────────────────────────────────────────

export interface CompanyEnrichment {
  id: string;
  companyId: string;
  employeeCount: number | null;
  employeeRange: string | null;
  revenueRange: string | null;
  fundingStage: string | null;
  fundingTotalUsd: number | null;
  foundedYear: number | null;
  industry: string | null;
  subIndustry: string | null;
  hqCity: string | null;
  hqCountry: string | null;
  technologies: string[];
  linkedinUrl: string | null;
  crunchbaseUrl: string | null;
  source: "manual" | "clearbit" | "apollo" | "hunter" | "other";
  sourceFetchedAt: string | null;
  notes: string | null;
}

export function useCompanyEnrichment(companyId: string | null | undefined) {
  const [enrichment, setEnrichment] = useState<CompanyEnrichment | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("company_enrichment")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    setEnrichment(data ? {
      id: data.id,
      companyId: data.company_id,
      employeeCount: data.employee_count,
      employeeRange: data.employee_range,
      revenueRange: data.revenue_range,
      fundingStage: data.funding_stage,
      fundingTotalUsd: data.funding_total_usd,
      foundedYear: data.founded_year,
      industry: data.industry,
      subIndustry: data.sub_industry,
      hqCity: data.hq_city,
      hqCountry: data.hq_country,
      technologies: data.technologies ?? [],
      linkedinUrl: data.linkedin_url,
      crunchbaseUrl: data.crunchbase_url,
      source: data.source,
      sourceFetchedAt: data.source_fetched_at,
      notes: data.notes,
    } : null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const saveEnrichment = useCallback(async (input: Partial<Omit<CompanyEnrichment, "id" | "companyId">>) => {
    if (!companyId) return;
    const supabase = createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return;
    await supabase.from("company_enrichment").upsert({
      agency_id: ctx.agencyId,
      company_id: companyId,
      employee_count: input.employeeCount,
      employee_range: input.employeeRange,
      revenue_range: input.revenueRange,
      funding_stage: input.fundingStage,
      funding_total_usd: input.fundingTotalUsd,
      founded_year: input.foundedYear,
      industry: input.industry,
      sub_industry: input.subIndustry,
      hq_city: input.hqCity,
      hq_country: input.hqCountry,
      technologies: input.technologies ?? [],
      linkedin_url: input.linkedinUrl,
      crunchbase_url: input.crunchbaseUrl,
      source: input.source ?? "manual",
      notes: input.notes,
    }, { onConflict: "agency_id,company_id" });
    await load();
  }, [companyId, load]);

  return { enrichment, loading, saveEnrichment };
}

// ─── US-157: Alumni Signals ───────────────────────────────────────────────────

export interface AlumniSignal {
  id: string;
  candidateId: string;
  placementId: string;
  originalTitle: string | null;
  newCompany: string | null;
  newTitle: string | null;
  signalType: "role_change" | "company_change" | "promotion" | "left_company";
  detectedAt: string;
  actioned: boolean;
}

export function useAlumniSignals() {
  const [signals, setSignals] = useState<AlumniSignal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("alumni_signals")
      .select("*")
      .eq("actioned", false)
      .order("detected_at", { ascending: false })
      .limit(50);
    setSignals(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((r: any) => ({
        id: r.id,
        candidateId: r.candidate_id,
        placementId: r.placement_id,
        originalTitle: r.original_title,
        newCompany: r.new_company,
        newTitle: r.new_title,
        signalType: r.signal_type,
        detectedAt: r.detected_at,
        actioned: r.actioned,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markActioned = useCallback(async (id: string, note?: string) => {
    const supabase = createClient();
    await supabase.from("alumni_signals").update({
      actioned: true,
      actioned_at: new Date().toISOString(),
      action_note: note ?? null,
    }).eq("id", id);
    setSignals((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { signals, loading, markActioned, refresh: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-017: Candidate Do-Not-Contact & Ghosting Log
// ─────────────────────────────────────────────────────────────────────────────

export type ContactFlagType = "do_not_contact" | "ghosted" | "placed_elsewhere" | "pause";

export interface ContactFlagUpdate {
  contactFlag: ContactFlagType | null;
  contactFlagReason?: string;
  nextContactDate?: string | null;
}

export function useCandidateContactFlag(candidateId: string) {
  const supabase = createClient();

  async function setFlag(update: ContactFlagUpdate) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("candidates")
      .update({
        contact_flag:        update.contactFlag,
        contact_flag_reason: update.contactFlagReason ?? null,
        contact_flag_set_at: update.contactFlag ? now : null,
        next_contact_date:   update.nextContactDate ?? null,
      })
      .eq("id", candidateId)
      .eq("agency_id", agency.id);
    if (error) throw error;
  }

  async function clearFlag() {
    return setFlag({ contactFlag: null });
  }

  return { setFlag, clearFlag };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-026: Requisition Exclusivity Windows
// ─────────────────────────────────────────────────────────────────────────────

export interface ExclusivityConfig {
  exclusive:            boolean;
  exclusiveStartDate?:  string | null;
  exclusiveEndDate?:    string | null;
  exclusiveReason?:     string | null;
  exclusiveContractRef?: string | null;
}

export function useJobExclusivity(jobId: string) {
  const supabase = createClient();
  const [config, setConfig] = useState<ExclusivityConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    supabase
      .from("jobs")
      .select("exclusive, exclusive_start_date, exclusive_end_date, exclusive_reason, exclusive_contract_ref")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data) setConfig({
          exclusive:            data.exclusive,
          exclusiveStartDate:   data.exclusive_start_date,
          exclusiveEndDate:     data.exclusive_end_date,
          exclusiveReason:      data.exclusive_reason,
          exclusiveContractRef: data.exclusive_contract_ref,
        });
        setLoading(false);
      });
  }, [jobId]);

  async function saveExclusivity(cfg: ExclusivityConfig) {
    const { error } = await supabase
      .from("jobs")
      .update({
        exclusive:              cfg.exclusive,
        exclusive_start_date:   cfg.exclusive ? (cfg.exclusiveStartDate ?? null) : null,
        exclusive_end_date:     cfg.exclusive ? (cfg.exclusiveEndDate ?? null) : null,
        exclusive_reason:       cfg.exclusive ? (cfg.exclusiveReason ?? null) : null,
        exclusive_contract_ref: cfg.exclusive ? (cfg.exclusiveContractRef ?? null) : null,
      })
      .eq("id", jobId);
    if (error) throw error;
    setConfig(cfg);
  }

  const isExpired = config?.exclusive && config.exclusiveEndDate
    ? new Date(config.exclusiveEndDate) < new Date()
    : false;

  const daysRemaining = config?.exclusive && config.exclusiveEndDate
    ? Math.ceil((new Date(config.exclusiveEndDate).getTime() - Date.now()) / 86_400_000)
    : null;

  return { config, loading, saveExclusivity, isExpired, daysRemaining };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-054: Call / Meeting Activity Log (Manual)
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityLogType = "call" | "meeting";
export type ActivityDirection = "inbound" | "outbound";
export type ActivityOutcomeTag = "connected" | "voicemail" | "left_message" | "no_answer" | "meeting_held" | "rescheduled";

export interface ActivityLogInput {
  type:         ActivityLogType;
  direction:    ActivityDirection;
  entityType:   "candidate" | "client" | "application";
  entityId:     string;
  participants: string[];       // names or email addresses
  durationMins?: number;
  occurredAt:   string;         // ISO datetime
  summary:      string;
  outcomeTag?:  ActivityOutcomeTag;
  transcriptId?: string;        // link to meeting transcript record if available
}

export interface ActivityLogRecord {
  id:          string;
  type:        string;
  direction:   string;
  participants: string[];
  durationMins: number | null;
  occurredAt:  string;
  summary:     string;
  outcomeTag:  string | null;
  actorName:   string | null;
  createdAt:   string;
}

export function useActivityLog(entityType: string, entityId: string) {
  const supabase = createClient();
  const [logs, setLogs] = useState<ActivityLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetch() {
    const { data } = await supabase
      .from("activities")
      .select("id, type, metadata, summary, created_at, actor_id, users(full_name)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .in("type", ["call", "meeting"])
      .order("created_at", { ascending: false })
      .limit(50);

    setLogs(
      (data ?? []).map((r: any) => ({
        id:           r.id,
        type:         r.type,
        direction:    r.metadata?.direction ?? "outbound",
        participants: r.metadata?.participants ?? [],
        durationMins: r.metadata?.duration_mins ?? null,
        occurredAt:   r.metadata?.occurred_at ?? r.created_at,
        summary:      r.summary,
        outcomeTag:   r.metadata?.outcome_tag ?? null,
        actorName:    r.users?.full_name ?? null,
        createdAt:    r.created_at,
      }))
    );
    setLoading(false);
  }

  useEffect(() => { if (entityId) fetch(); }, [entityId, entityType]);

  async function logActivity(input: ActivityLogInput) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    const { error } = await supabase.from("activities").insert({
      org_id:      agency.id,
      entity_type: input.entityType,
      entity_id:   input.entityId,
      type:        input.type,
      summary:     input.summary,
      metadata: {
        direction:    input.direction,
        participants: input.participants,
        duration_mins: input.durationMins ?? null,
        outcome_tag:  input.outcomeTag ?? null,
        occurred_at:  input.occurredAt,
        transcript_id: input.transcriptId ?? null,
      },
    });
    if (error) throw error;
    await fetch();
  }

  return { logs, loading, logActivity };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-046: Client Portal Audit Trail
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalAuditEvent {
  id:          string;
  actorType:   string;
  actorEmail:  string | null;
  eventType:   string;
  candidateId: string | null;
  jobId:       string | null;
  metadata:    Record<string, unknown>;
  occurredAt:  string;
}

export function usePortalAuditTrail(companyId: string) {
  const supabase = createClient();
  const [events, setEvents] = useState<PortalAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("portal_audit_events")
      .select("id, actor_type, actor_email, event_type, candidate_id, job_id, metadata, occurred_at")
      .eq("company_id", companyId)
      .order("occurred_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setEvents(
          (data ?? []).map((r: any) => ({
            id:          r.id,
            actorType:   r.actor_type,
            actorEmail:  r.actor_email,
            eventType:   r.event_type,
            candidateId: r.candidate_id,
            jobId:       r.job_id,
            metadata:    r.metadata ?? {},
            occurredAt:  r.occurred_at,
          }))
        );
        setLoading(false);
      });
  }, [companyId]);

  return { events, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-122: Candidate Longlist / Shortlist per Req
// ─────────────────────────────────────────────────────────────────────────────

export type LonglistType = "longlist" | "shortlist" | "calibration";

export interface LonglistEntry {
  id:           string;
  candidateId:  string;
  listType:     LonglistType;
  rank:         number | null;
  notes:        string | null;
  promotedAt:   string | null;
  submittedAt:  string | null;
  createdAt:    string;
  candidate?: {
    id:        string;
    firstName: string;
    lastName:  string;
    headline:  string | null;
    location:  string | null;
  };
}

export function useJobLonglist(jobId: string) {
  const supabase = createClient();
  const [entries, setEntries] = useState<LonglistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetch() {
    const { data } = await supabase
      .from("job_longlists")
      .select(`
        id, candidate_id, list_type, rank, notes, promoted_at, submitted_at, created_at,
        candidates(id, first_name, last_name, headline, location)
      `)
      .eq("job_id", jobId)
      .order("rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    setEntries(
      (data ?? []).map((r: any) => ({
        id:          r.id,
        candidateId: r.candidate_id,
        listType:    r.list_type,
        rank:        r.rank,
        notes:       r.notes,
        promotedAt:  r.promoted_at,
        submittedAt: r.submitted_at,
        createdAt:   r.created_at,
        candidate:   r.candidates
          ? { id: r.candidates.id, firstName: r.candidates.first_name,
              lastName: r.candidates.last_name, headline: r.candidates.headline,
              location: r.candidates.location }
          : undefined,
      }))
    );
    setLoading(false);
  }

  useEffect(() => { if (jobId) fetch(); }, [jobId]);

  async function addToList(candidateId: string, listType: LonglistType = "longlist", notes?: string) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    const { error } = await supabase.from("job_longlists").upsert(
      { agency_id: agency.id, job_id: jobId, candidate_id: candidateId, list_type: listType, notes: notes ?? null },
      { onConflict: "job_id,candidate_id,list_type" }
    );
    if (error) throw error;
    await fetch();
  }

  async function removeFromList(entryId: string) {
    const { error } = await supabase.from("job_longlists").delete().eq("id", entryId);
    if (error) throw error;
    setEntries(prev => prev.filter(e => e.id !== entryId));
  }

  async function promoteToShortlist(entryId: string) {
    const { error } = await supabase.from("job_longlists").update({
      list_type:   "shortlist",
      promoted_at: new Date().toISOString(),
    }).eq("id", entryId);
    if (error) throw error;
    await fetch();
  }

  async function markSubmitted(entryId: string) {
    const { error } = await supabase.from("job_longlists").update({
      submitted_at: new Date().toISOString(),
    }).eq("id", entryId);
    if (error) throw error;
    await fetch();
  }

  async function updateRank(entryId: string, rank: number) {
    const { error } = await supabase.from("job_longlists").update({ rank }).eq("id", entryId);
    if (error) throw error;
    await fetch();
  }

  const longlist  = entries.filter(e => e.listType === "longlist");
  const shortlist = entries.filter(e => e.listType === "shortlist");
  const calibration = entries.filter(e => e.listType === "calibration");

  return { entries, longlist, shortlist, calibration, loading, addToList, removeFromList, promoteToShortlist, markSubmitted, updateRank };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-474: Candidate Portal Invite Flow
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidatePortalInvite {
  id:            string;
  applicationId: string;
  candidateId:   string;
  jobId:         string;
  token:         string;
  acceptedAt:    string | null;
  revokedAt:     string | null;
  expiresAt:     string;
  lastViewedAt:  string | null;
  viewCount:     number;
  createdAt:     string;
}

export function useCandidatePortalInvite(applicationId: string) {
  const supabase = createClient();
  const [invite, setInvite] = useState<CandidatePortalInvite | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetch() {
    const { data } = await supabase
      .from("candidate_portal_invites")
      .select("*")
      .eq("application_id", applicationId)
      .maybeSingle();
    setInvite(
      data ? {
        id:            data.id,
        applicationId: data.application_id,
        candidateId:   data.candidate_id,
        jobId:         data.job_id,
        token:         data.token,
        acceptedAt:    data.accepted_at,
        revokedAt:     data.revoked_at,
        expiresAt:     data.expires_at,
        lastViewedAt:  data.last_viewed_at,
        viewCount:     data.view_count,
        createdAt:     data.created_at,
      } : null
    );
    setLoading(false);
  }

  useEffect(() => { if (applicationId) fetch(); }, [applicationId]);

  async function sendInvite(candidateId: string, jobId: string) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    // Revoke any existing invite first (upsert handles uniqueness via application_id UNIQUE)
    const { data, error } = await supabase
      .from("candidate_portal_invites")
      .upsert(
        { agency_id: agency.id, application_id: applicationId, candidate_id: candidateId, job_id: jobId,
          revoked_at: null, accepted_at: null, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          view_count: 0 },
        { onConflict: "application_id" }
      )
      .select()
      .single();
    if (error) throw error;
    await fetch();
    return data;
  }

  async function revokeInvite() {
    if (!invite) return;
    const { error } = await supabase.from("candidate_portal_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (error) throw error;
    await fetch();
  }

  const isActive = invite
    && !invite.revokedAt
    && new Date(invite.expiresAt) > new Date();

  const portalUrl = invite
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/candidate/${invite.token}`
    : null;

  return { invite, loading, isActive, portalUrl, sendInvite, revokeInvite };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-093: Book-of-Business Transfer
// ─────────────────────────────────────────────────────────────────────────────

export interface BizTransferPreview {
  fromUserId:  string;
  fromName:    string;
  toUserId:    string;
  toName:      string;
  candidates:  number;
  jobs:        number;
  clients:     number;
  tasks:       number;
}

export interface BizTransfer {
  id:                    string;
  fromUserId:            string;
  toUserId:              string;
  candidatesTransferred: number;
  jobsTransferred:       number;
  clientsTransferred:    number;
  tasksTransferred:      number;
  status:                string;
  dualOwnerDays:         number | null;
  dualOwnerUntil:        string | null;
  completedAt:           string | null;
  createdAt:             string;
}

export function useBookOfBusinessTransfer() {
  const supabase = createClient();
  const [transfers, setTransfers] = useState<BizTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTransfers() {
    const { data } = await supabase
      .from("biz_transfers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    setTransfers(
      (data ?? []).map((r: any) => ({
        id:                    r.id,
        fromUserId:            r.from_user_id,
        toUserId:              r.to_user_id,
        candidatesTransferred: r.candidates_transferred,
        jobsTransferred:       r.jobs_transferred,
        clientsTransferred:    r.clients_transferred,
        tasksTransferred:      r.tasks_transferred,
        status:                r.status,
        dualOwnerDays:         r.dual_owner_days,
        dualOwnerUntil:        r.dual_owner_until,
        completedAt:           r.completed_at,
        createdAt:             r.created_at,
      }))
    );
    setLoading(false);
  }

  useEffect(() => { loadTransfers(); }, []);

  /** Preview counts before executing — reads current state, no writes */
  async function previewTransfer(fromUserId: string): Promise<BizTransferPreview> {
    const ctx = await getAgencyContext(supabase);
    if (!ctx) throw new Error("Unauthorized");
    const agency = { id: ctx.agencyId };

    const [cands, jobs, clients, tasks] = await Promise.all([
      supabase.from("candidates").select("id", { count: "exact", head: true }).eq("agency_id", agency.id).eq("owner_id", fromUserId),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("agency_id", agency.id).eq("owner_id", fromUserId),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("agency_id", agency.id).eq("owner_id", fromUserId),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("org_id", agency.id).eq("assignee_id", fromUserId),
    ]);

    return {
      fromUserId,
      fromName:   "—",
      toUserId:   "",
      toName:     "—",
      candidates: cands.count ?? 0,
      jobs:       jobs.count ?? 0,
      clients:    clients.count ?? 0,
      tasks:      tasks.count ?? 0,
    };
  }

  /** Execute the transfer via server action */
  async function executeTransfer(fromUserId: string, toUserId: string, dualOwnerDays?: number) {
    const res = await fetch(`/api/admin/biz-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUserId, toUserId, dualOwnerDays }),
    });
    if (!res.ok) throw new Error(await res.text());
    await loadTransfers();
  }

  return { transfers, loading, previewTransfer, executeTransfer };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-348: Sensitive Field Encryption
// ─────────────────────────────────────────────────────────────────────────────

const ENC_ALG = "AES-GCM";

async function deriveKey(agencyId: string): Promise<CryptoKey> {
  const base = process.env.NEXT_PUBLIC_FIELD_ENCRYPTION_KEY ?? "";
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(base), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode(agencyId), iterations: 100_000, hash: "SHA-256" },
    keyMaterial, { name: ENC_ALG, length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export async function encryptField(value: string, agencyId: string) {
  const key = await deriveKey(agencyId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: ENC_ALG, iv }, key, new TextEncoder().encode(value));
  const ctArr = new Uint8Array(ct);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...ctArr.slice(0, -16))),
    tag: btoa(String.fromCharCode(...ctArr.slice(-16))),
  };
}

export async function decryptField(enc: { iv: string; ciphertext: string; tag: string }, agencyId: string) {
  const key = await deriveKey(agencyId);
  const iv  = Uint8Array.from(atob(enc.iv),  c => c.charCodeAt(0));
  const ct  = Uint8Array.from(atob(enc.ciphertext), c => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(enc.tag), c => c.charCodeAt(0));
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct); combined.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt({ name: ENC_ALG, iv }, key, combined);
  return new TextDecoder().decode(plain);
}

export function useCandidateEncryptedFields(candidateId: string) {
  const supabase = createClient();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function readFields(fieldNames: string[]) {
    setLoading(true);
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    const { data } = await supabase.from("candidates").select("encrypted_fields").eq("id", candidateId).single();
    const enc = (data?.encrypted_fields ?? {}) as Record<string, { iv: string; ciphertext: string; tag: string }>;
    const result: Record<string, string> = {};
    for (const name of fieldNames) {
      if (enc[name]) {
        try { result[name] = await decryptField(enc[name], agency.id); } catch { result[name] = ""; }
      }
    }
    setFields(result);
    setLoading(false);
    return result;
  }

  async function writeField(fieldName: string, value: string) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    const encrypted = await encryptField(value, agency.id);
    const { data: current } = await supabase.from("candidates").select("encrypted_fields").eq("id", candidateId).single();
    const updated = { ...(current?.encrypted_fields ?? {}), [fieldName]: encrypted };
    await supabase.from("candidates").update({ encrypted_fields: updated }).eq("id", candidateId);
    setFields(f => ({ ...f, [fieldName]: value }));
  }

  return { fields, loading, readFields, writeField };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-351: Record of Processing Activities (RoPA)
// ─────────────────────────────────────────────────────────────────────────────

export interface DataProcessingRecord {
  id:                    string;
  activityName:          string;
  purpose:               string;
  legalBasis:            string;
  dataCategories:        string[];
  dataSubjects:          string[];
  recipients:            string[];
  retentionPeriod:       string | null;
  thirdCountryTransfers: string[];
  transferMechanism:     string | null;
  lastReviewedAt:        string | null;
  isSeeded:              boolean;
  createdAt:             string;
}

export function useRopa() {
  const supabase = createClient();
  const [records, setRecords] = useState<DataProcessingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetch() {
    const { data } = await supabase
      .from("data_processing_records")
      .select("*")
      .order("activity_name");
    setRecords((data ?? []).map((r: any) => ({
      id:                    r.id,
      activityName:          r.activity_name,
      purpose:               r.purpose,
      legalBasis:            r.legal_basis,
      dataCategories:        r.data_categories ?? [],
      dataSubjects:          r.data_subjects ?? [],
      recipients:            r.recipients ?? [],
      retentionPeriod:       r.retention_period,
      thirdCountryTransfers: r.third_country_transfers ?? [],
      transferMechanism:     r.transfer_mechanism,
      lastReviewedAt:        r.last_reviewed_at,
      isSeeded:              r.is_seeded,
      createdAt:             r.created_at,
    })));
    setLoading(false);
  }

  useEffect(() => { fetch(); }, []);

  async function markReviewed(id: string) {
    const { error } = await supabase.from("data_processing_records")
      .update({ last_reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await fetch();
  }

  async function upsertRecord(input: Partial<DataProcessingRecord>) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    const payload: any = {
      agency_id:               agency.id,
      activity_name:           input.activityName,
      purpose:                 input.purpose,
      legal_basis:             input.legalBasis,
      data_categories:         input.dataCategories ?? [],
      data_subjects:           input.dataSubjects ?? [],
      recipients:              input.recipients ?? [],
      retention_period:        input.retentionPeriod ?? null,
      third_country_transfers: input.thirdCountryTransfers ?? [],
      transfer_mechanism:      input.transferMechanism ?? null,
    };
    if (input.id) payload.id = input.id;
    const { error } = await supabase.from("data_processing_records").upsert(payload, { onConflict: "id" });
    if (error) throw error;
    await fetch();
  }

  const overdueReview = records.filter(r => {
    if (!r.lastReviewedAt) return true;
    return (Date.now() - new Date(r.lastReviewedAt).getTime()) > 365 * 86_400_000;
  });

  return { records, loading, markReviewed, upsertRecord, overdueReview };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-404: IP Allowlist
// ─────────────────────────────────────────────────────────────────────────────

export interface IpAllowlistRule { id: string; cidr: string; label: string | null; isActive: boolean; createdAt: string }

export function useIpAllowlist() {
  const supabase = createClient();
  const [rules, setRules] = useState<IpAllowlistRule[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetch() {
    const { data } = await supabase.from("ip_allowlist_rules").select("*").order("created_at");
    setRules((data ?? []).map((r: any) => ({ id: r.id, cidr: r.cidr, label: r.label, isActive: r.is_active, createdAt: r.created_at })));
    setLoading(false);
  }

  useEffect(() => { fetch(); }, []);

  async function addRule(cidr: string, label?: string) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    const { error } = await supabase.from("ip_allowlist_rules").insert({ agency_id: agency.id, cidr, label: label ?? null });
    if (error) throw error;
    await fetch();
  }

  async function deleteRule(id: string) {
    const { error } = await supabase.from("ip_allowlist_rules").delete().eq("id", id);
    if (error) throw error;
    setRules(r => r.filter(x => x.id !== id));
  }

  async function toggleRule(id: string, isActive: boolean) {
    const { error } = await supabase.from("ip_allowlist_rules").update({ is_active: isActive }).eq("id", id);
    if (error) throw error;
    await fetch();
  }

  return { rules, loading, addRule, deleteRule, toggleRule };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-420: EEO-1 Demographic Capture
// ─────────────────────────────────────────────────────────────────────────────

export interface EeoData {
  gender?: string; raceEthnicity?: string; veteranStatus?: string; disabilityStatus?: string;
}

export function useEeoData(agencyId: string) {
  const supabase = createClient();

  async function getAggregate() {
    const { data } = await supabase
      .from("candidate_eeo_data")
      .select("gender, race_ethnicity, veteran_status, disability_status")
      .eq("agency_id", agencyId);
    return data ?? [];
  }

  // Called from public portal (service role)
  async function submitEeo(candidateId: string, eeo: EeoData) {
    const { error } = await supabase.from("candidate_eeo_data").upsert({
      agency_id:         agencyId,
      candidate_id:      candidateId,
      gender:            eeo.gender ?? "declined",
      race_ethnicity:    eeo.raceEthnicity ?? "declined",
      veteran_status:    eeo.veteranStatus ?? "declined",
      disability_status: eeo.disabilityStatus ?? "declined",
    }, { onConflict: "agency_id,candidate_id" });
    if (error) throw error;
  }

  return { getAggregate, submitEeo };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-443: Integration Marketplace
// ─────────────────────────────────────────────────────────────────────────────

export interface AgencyConnector { connectorKey: string; enabled: boolean; enabledAt: string | null }

export function useAgencyConnectors() {
  const supabase = createClient();
  const [connectors, setConnectors] = useState<AgencyConnector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("agency_connectors").select("connector_key, enabled, enabled_at")
      .then(({ data }) => {
        setConnectors((data ?? []).map((r: any) => ({ connectorKey: r.connector_key, enabled: r.enabled, enabledAt: r.enabled_at })));
        setLoading(false);
      });
  }, []);

  async function toggleConnector(key: string, enabled: boolean) {
    const _ctx = await getAgencyContext(supabase); if (!_ctx) throw new Error("Unauthorized"); const agency = { id: _ctx.agencyId };
    await supabase.from("agency_connectors").upsert(
      { agency_id: agency.id, connector_key: key, enabled, enabled_at: enabled ? new Date().toISOString() : null,
        disabled_at: enabled ? null : new Date().toISOString() },
      { onConflict: "agency_id,connector_key" }
    );
    setConnectors(c => c.map(x => x.connectorKey === key ? { ...x, enabled } : x));
  }

  const enabledKeys = new Set(connectors.filter(c => c.enabled).map(c => c.connectorKey));

  return { connectors, loading, toggleConnector, enabledKeys };
}
