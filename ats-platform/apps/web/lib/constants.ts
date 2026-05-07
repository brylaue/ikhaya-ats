/**
 * Shared constants used across API routes, server actions, and client code.
 * Single source of truth — update here, not inline.
 */

// ─── User roles ───────────────────────────────────────────────────────────────

export const USER_ROLES = ["owner", "admin", "senior_recruiter", "recruiter", "researcher"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles that can invite or manage team members */
export const MANAGER_ROLES: UserRole[] = ["owner", "admin"];

/** Roles that have full recruiter capabilities */
export const RECRUITER_ROLES: UserRole[] = ["owner", "admin", "senior_recruiter", "recruiter"];

/** Roles that can be assigned to invitees (cannot invite someone as owner) */
export const INVITABLE_ROLES: UserRole[] = ["admin", "senior_recruiter", "recruiter", "researcher"];

// ─── Job statuses ─────────────────────────────────────────────────────────────
// US-310: values must match the `job_status` Postgres enum defined in
// 001_initial_schema.sql. Do not drift — the DB will reject mismatched writes.

export const JOB_STATUSES = ["draft", "active", "on_hold", "filled", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ─── Job priorities ───────────────────────────────────────────────────────────

export const JOB_PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

// ─── Candidate sources ────────────────────────────────────────────────────────

export const CANDIDATE_SOURCES = [
  "LinkedIn",
  "Referral",
  "Database",
  "Job Board",
  "Direct",
  "Other",
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

// ─── Pipeline stages ──────────────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  "sourced",
  "contacted",
  "applied",
  "screening",
  "interview",
  "assessment",
  "offer",
  "placed",
  "rejected",
  "withdrawn",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// ─── Placement types ──────────────────────────────────────────────────────────

export const PLACEMENT_TYPES = ["permanent", "contract", "temp_to_perm"] as const;
export type PlacementType = (typeof PLACEMENT_TYPES)[number];

// ─── Validation helpers ───────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Returns true if the string is a syntactically valid email address.
 * More robust than `includes("@")` but not a full RFC 5322 check.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Returns true if value is one of the allowed enum entries.
 * Type-safe guard that narrows the type.
 */
export function isValidEnumValue<T extends string>(
  value: string,
  allowedValues: readonly T[]
): value is T {
  return (allowedValues as readonly string[]).includes(value);
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

/** How long (ms) to block a second invite to the same email address */
export const INVITE_RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours
