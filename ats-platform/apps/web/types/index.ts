// ─── Enums ────────────────────────────────────────────────────────────────────

export type CandidateStatus =
  | "active"
  | "passive"
  | "not_looking"
  | "placed"
  | "do_not_contact";

export type ApplicationStatus =
  | "identified"
  | "screened"
  | "ready_to_submit"
  | "submitted"
  | "client_review"
  | "interview_scheduled"
  | "offer"
  | "placed"
  | "not_progressing";

export type JobStatus = "draft" | "active" | "on_hold" | "filled" | "cancelled" | "closed";
export type JobType = "permanent" | "contract" | "temp" | "interim";

export type ClientDecision = "advance" | "hold" | "pass";

export type UserRole =
  | "owner"
  | "admin"
  | "senior_recruiter"
  | "recruiter"
  | "viewer"
  | "client";

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    remote?: boolean;
  };
  avatarUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  status: CandidateStatus;
  source?: string;
  tags: Tag[];
  skills: CandidateSkill[];
  summary?: string;
  currentSalary?: number;
  desiredSalary?: number;
  salaryCurrency?: string;
  openToRemote?: boolean;
  yearsExperience?: number;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  owner?: User;
}

export interface WorkHistory {
  id: string;
  candidateId: string;
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  description?: string;
  location?: string;
}

export interface Skill {
  id: string;
  name: string;
  category?: string;
  normalizedName: string;
}

export interface CandidateSkill {
  skillId: string;
  skill: Skill;
  proficiencyLevel?: "beginner" | "intermediate" | "advanced" | "expert";
  yearsExperience?: number;
  source: "self" | "parsed" | "inferred" | "recruiter";
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  orgId: string;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  title: string;
  clientId: string;
  client?: Client;
  location?: string;
  type: JobType;
  status: JobStatus;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  description?: string;
  priority: "low" | "medium" | "high" | "urgent";
  ownerId?: string;
  owner?: User;
  pipeline?: PipelineStage[];
  estimatedFee?: number;
  feeProbability?: number;
  feePct?: number;
  headcount?: number;
  targetStartDate?: string;
  createdAt: string;
  updatedAt: string;
  applicationCount?: number;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  type:
    | "sourced"
    | "screened"
    | "submitted"
    | "client_review"
    | "interview"
    | "offer"
    | "placed"
    | "rejected"
    | "custom";
  color?: string;
  slaDays?: number;
  applications?: Application[];
}

// ─── Applications ─────────────────────────────────────────────────────────────

export interface Application {
  id: string;
  candidateId: string;
  candidate?: Candidate;
  jobId: string;
  job?: Job;
  stageId: string;
  stage?: PipelineStage;
  status: ApplicationStatus;
  score?: number;
  recruiterNote?: string;
  daysInStage: number;
  appliedAt: string;
  lastActivityAt: string;
  submittedToClientAt?: string;
  clientDecision?: ClientDecision;
  clientDecisionReason?: string;
  clientDecisionNote?: string;
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  domain?: string;
  logoUrl?: string;
  industry?: string;
  size?: string;
  primaryContactId?: string;
  primaryContact?: Contact;
  portalSlug?: string;
  portalDomain?: string;
  portalBrandColor?: string;
  healthScore?: number;
  createdAt: string;
  activeJobCount?: number;
  placementsYtd?: number;
}

export interface Contact {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  title?: string;
  linkedinUrl?: string;
  avatarUrl?: string;
  isPortalUser?: boolean;
}

// ─── Auth / Users ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  orgId: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Org {
  id: string;
  name: string;
  logoUrl?: string;
  slug: string;
  timezone: string;
  createdAt: string;
  memberCount: number;
}

// ─── Activities ───────────────────────────────────────────────────────────────

export type ActivityType =
  | "note"
  | "call"
  | "email"
  | "submission"
  | "stage_change"
  | "placement"
  | "client_feedback"
  | "task_created"
  | "task_completed";

export interface Activity {
  id: string;
  entityType: "candidate" | "job" | "application" | "client";
  entityId: string;
  actorId: string;
  actor?: User;
  type: ActivityType;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface FunnelStage {
  stageName: string;
  count: number;
  conversionRate?: number;
  avgDays?: number;
}

export interface RecruiterMetrics {
  userId: string;
  user?: User;
  submissions: number;
  interviews: number;
  placements: number;
  activityVolume: number;
  avgTimeToFill?: number;
  submissionToInterview?: number;
  interviewToOffer?: number;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export interface SearchFilters {
  query?: string;
  locations?: string[];
  skills?: string[];
  tags?: string[];
  statuses?: CandidateStatus[];
  source?: string[];
  minExperience?: number;
  maxExperience?: number;
  minSalary?: number;
  maxSalary?: number;
  remoteOnly?: boolean;
  lastActivityDays?: number;
  ownerId?: string;
}

export type SortDirection = "asc" | "desc";
export interface SortConfig {
  field: string;
  direction: SortDirection;
}
