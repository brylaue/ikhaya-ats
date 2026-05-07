"use client";

/**
 * compliance-hooks.ts
 * Data compliance & privacy hooks: consent management, DSAR workflow,
 * retention policy, data processing records, breach incidents, and
 * cascading candidate erasure.
 *
 * Split from the monolithic hooks.ts per EP-24 US-311.
 */

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ConsentType =
  | "data_processing"
  | "marketing_email"
  | "sms"
  | "portal_sharing"
  | "enrichment"
  | "ai_processing"
  | "third_party_ats";

export type ConsentStatus = "pending" | "granted" | "denied" | "withdrawn" | "expired";

export type LegalBasis =
  | "consent"
  | "legitimate_interest"
  | "contract"
  | "legal_obligation"
  | "vital_interests"
  | "public_task";

export type ConsentSource =
  | "manual"
  | "csv_import"
  | "chrome_extension"
  | "candidate_portal"
  | "api"
  | "email_reply";

export interface CandidateConsent {
  id: string;
  agency_id: string;
  candidate_id: string;
  consent_type: ConsentType;
  status: ConsentStatus;
  legal_basis: LegalBasis;
  source: ConsentSource;
  ip_address?: string;
  user_agent?: string;
  consent_text?: string;
  granted_at?: string;
  withdrawn_at?: string;
  expires_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type PrivacyRequestType =
  | "access"
  | "erasure"
  | "portability"
  | "rectification"
  | "restriction"
  | "objection";

export type PrivacyRequestStatus =
  | "pending"
  | "verifying"
  | "in_review"
  | "fulfilled"
  | "denied"
  | "cancelled";

export interface PrivacyRequest {
  id: string;
  agency_id: string;
  candidate_id?: string;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  requester_email: string;
  requester_name?: string;
  requester_message?: string;
  identity_verified: boolean;
  identity_verified_at?: string;
  verified_by?: string;
  verification_method?: "email_token" | "document" | "knowledge" | "manual";
  received_at: string;
  due_at: string;
  fulfilled_at?: string;
  denial_reason?: string;
  internal_notes?: string;
  export_path?: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  // Computed
  is_overdue?: boolean;
  days_remaining?: number;
}

export interface DataRetentionPolicy {
  id: string;
  agency_id: string;
  candidate_inactive_months: number;
  email_body_months: number;
  activity_log_months: number;
  placement_months: number;
  audit_log_months: number;
  resume_file_months: number;
  enforcement_enabled: boolean;
  dry_run_mode: boolean;
  notify_before_deletion_days: number;
  last_enforcement_run?: string;
  last_enforcement_summary?: {
    run_at: string;
    dry_run: boolean;
    candidates_flagged: number;
    email_bodies_purged: number;
  };
  primary_regulation: "gdpr" | "uk_gdpr" | "ccpa" | "pipeda" | "none";
  data_residency_region: string;
  created_at: string;
  updated_at: string;
}

export interface DataProcessingRecord {
  id: string;
  agency_id: string;
  activity_name: string;
  purpose: string;
  legal_basis: LegalBasis;
  legitimate_interest_assessment?: string;
  data_categories: string[];
  data_subjects: string[];
  special_categories?: string[];
  recipients?: string[];
  third_country_transfers?: string[];
  transfer_mechanism?: "adequacy_decision" | "scc" | "bcr" | "derogation" | "none";
  retention_period: string;
  security_measures?: string[];
  is_active: boolean;
  last_reviewed_at?: string;
  reviewed_by?: string;
  created_at: string;
  updated_at: string;
}

export type IncidentType =
  | "data_breach"
  | "near_miss"
  | "subject_complaint"
  | "regulatory_audit"
  | "policy_violation";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus =
  | "open"
  | "investigating"
  | "contained"
  | "resolved"
  | "reported_to_authority"
  | "closed";

export interface ComplianceIncident {
  id: string;
  agency_id: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description?: string;
  affected_systems?: string[];
  affected_records_estimate?: number;
  affected_candidate_ids?: string[];
  discovered_at: string;
  authority_notify_deadline: string; // generated column: discovered_at + 72h
  contained_at?: string;
  notified_authority_at?: string;
  notified_individuals_at?: string;
  authority_reference?: string;
  root_cause?: string;
  remediation_steps?: string;
  lessons_learned?: string;
  discovered_by?: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  // Computed
  hours_to_deadline?: number;
  is_past_deadline?: boolean;
}

export interface RetentionFlag {
  id: string;
  agency_id: string;
  candidate_id: string;
  flagged_at: string;
  purge_after: string;
  reason: string;
  months_inactive?: number;
  dismissed_at?: string;
  purged_at?: string;
}

export interface ErasureSummary {
  candidate_id: string;
  candidate_name: string;
  erased_at: string;
  erased_by: string;
  privacy_request_id?: string;
  rows_deleted: {
    email_links: number;
    activities: number;
    applications: number;
    tasks: number;
    sequence_enrollments: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSENT HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All consent records for a candidate — used on the candidate profile.
 */
export function useCandidateConsents(candidateId: string) {
  const [consents, setConsents]   = useState<CandidateConsent[]>([]);
  const [loading, setLoading]     = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    const { data } = await supabase
      .from("candidate_consents")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    setConsents(data ?? []);
    setLoading(false);
  }, [candidateId]);

  useEffect(() => { load(); }, [load]);

  const grantConsent = useCallback(async (
    type: ConsentType,
    opts: {
      legal_basis: LegalBasis;
      source?: ConsentSource;
      consent_text?: string;
      expires_at?: string;
    }
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("users")
      .select("agency_id")
      .eq("id", user.id)
      .single();
    if (!profile) return null;

    // Upsert: if a consent of this type already exists, update it
    const existing = consents.find(c => c.consent_type === type);
    if (existing) {
      const { data } = await supabase
        .from("candidate_consents")
        .update({
          status: "granted",
          legal_basis: opts.legal_basis,
          source: opts.source ?? "manual",
          consent_text: opts.consent_text,
          expires_at: opts.expires_at,
          granted_at: new Date().toISOString(),
          withdrawn_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();
      await load();
      return data;
    }

    const { data } = await supabase
      .from("candidate_consents")
      .insert({
        candidate_id: candidateId,
        agency_id: profile.agency_id,
        consent_type: type,
        status: "granted",
        legal_basis: opts.legal_basis,
        source: opts.source ?? "manual",
        consent_text: opts.consent_text,
        expires_at: opts.expires_at,
        granted_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    await load();
    return data;
  }, [candidateId, consents, load]);

  const withdrawConsent = useCallback(async (consentId: string) => {
    await supabase
      .from("candidate_consents")
      .update({
        status: "withdrawn",
        withdrawn_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", consentId);
    await load();
  }, [load]);

  // Convenience: check if a specific type is currently granted
  const isGranted = useCallback((type: ConsentType): boolean => {
    const c = consents.find(x => x.consent_type === type);
    if (!c) return false;
    if (c.status !== "granted") return false;
    if (c.expires_at && new Date(c.expires_at) < new Date()) return false;
    return true;
  }, [consents]);

  const getConsent = useCallback((type: ConsentType) =>
    consents.find(x => x.consent_type === type),
  [consents]);

  return {
    consents, loading,
    grantConsent, withdrawConsent,
    isGranted, getConsent,
    refresh: load,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY REQUEST (DSAR) HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agency-wide DSAR queue — for the compliance dashboard.
 */
export function usePrivacyRequests(filters?: {
  status?: PrivacyRequestStatus;
  request_type?: PrivacyRequestType;
}) {
  const [requests, setRequests]   = useState<PrivacyRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("privacy_requests")
      .select("*")
      .order("due_at", { ascending: true });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.request_type) query = query.eq("request_type", filters.request_type);

    const { data } = await query;
    const now = new Date();

    const enriched = (data ?? []).map(r => ({
      ...r,
      is_overdue: new Date(r.due_at) < now && !["fulfilled","denied","cancelled"].includes(r.status),
      days_remaining: Math.ceil((new Date(r.due_at).getTime() - now.getTime()) / 86400000),
    }));
    setRequests(enriched);
    setLoading(false);
  }, [filters?.status, filters?.request_type]);

  useEffect(() => { load(); }, [load]);

  const createRequest = useCallback(async (payload: {
    request_type: PrivacyRequestType;
    requester_email: string;
    requester_name?: string;
    requester_message?: string;
    candidate_id?: string;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!profile) return null;

    const { data } = await supabase
      .from("privacy_requests")
      .insert({
        ...payload,
        agency_id: profile.agency_id,
        status: "pending",
      })
      .select()
      .single();

    await load();
    return data;
  }, [load]);

  const updateRequest = useCallback(async (
    id: string,
    updates: Partial<PrivacyRequest>
  ) => {
    await supabase
      .from("privacy_requests")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    await load();
  }, [load]);

  const verifyIdentity = useCallback(async (
    id: string,
    method: "email_token" | "document" | "knowledge" | "manual"
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("privacy_requests")
      .update({
        identity_verified: true,
        identity_verified_at: new Date().toISOString(),
        verified_by: user?.id,
        verification_method: method,
        status: "in_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await load();
  }, [load]);

  const fulfillRequest = useCallback(async (id: string, exportPath?: string) => {
    await supabase
      .from("privacy_requests")
      .update({
        status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
        export_path: exportPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await load();
  }, [load]);

  const denyRequest = useCallback(async (id: string, reason: string) => {
    await supabase
      .from("privacy_requests")
      .update({
        status: "denied",
        denial_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await load();
  }, [load]);

  const overdueCount = requests.filter(r => r.is_overdue).length;
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return {
    requests, loading,
    createRequest, updateRequest,
    verifyIdentity, fulfillRequest, denyRequest,
    overdueCount, pendingCount,
    refresh: load,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASCADING ERASURE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes GDPR Article 17 right-to-erasure via the DB function.
 * Deletes the candidate and all their data across all tables.
 * Returns a summary of what was deleted.
 */
export function useErasureCandidate() {
  const [erasing, setErasing]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const supabase = createClient();

  const eraseCandidate = useCallback(async (
    candidateId: string,
    privacyRequestId?: string
  ): Promise<ErasureSummary | null> => {
    setErasing(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("users").select("agency_id").eq("id", user.id).single();
      if (!profile) throw new Error("Agency not found");

      const { data, error: rpcError } = await supabase.rpc("erase_candidate", {
        p_candidate_id:   candidateId,
        p_agency_id:      profile.agency_id,
        p_requested_by:   user.id,
        p_request_id:     privacyRequestId ?? null,
      });

      if (rpcError) throw rpcError;
      return data as ErasureSummary;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erasure failed";
      setError(msg);
      return null;
    } finally {
      setErasing(false);
    }
  }, []);

  return { eraseCandidate, erasing, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// RETENTION POLICY
// ─────────────────────────────────────────────────────────────────────────────

export function useRetentionPolicy() {
  const [policy, setPolicy]   = useState<DataRetentionPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("data_retention_policies")
      .select("*")
      .single();
    setPolicy(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updatePolicy = useCallback(async (updates: Partial<DataRetentionPolicy>) => {
    setSaving(true);
    await supabase
      .from("data_retention_policies")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("agency_id", policy?.agency_id ?? "");
    await load();
    setSaving(false);
  }, [policy, load]);

  const runEnforcement = useCallback(async (): Promise<Record<string, unknown> | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!profile) return null;

    const { data } = await supabase.rpc("run_retention_enforcement", {
      p_agency_id: profile.agency_id,
    });
    await load();
    return data;
  }, [load]);

  return { policy, loading, saving, updatePolicy, runEnforcement, refresh: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// RETENTION FLAGS
// ─────────────────────────────────────────────────────────────────────────────

export function useRetentionFlags() {
  const [flags, setFlags]     = useState<RetentionFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("candidate_retention_flags")
      .select("*, candidates(first_name, last_name, email, current_title)")
      .is("purged_at", null)
      .is("dismissed_at", null)
      .order("purge_after", { ascending: true });
    setFlags(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismissFlag = useCallback(async (flagId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("candidate_retention_flags")
      .update({
        dismissed_at: new Date().toISOString(),
        dismissed_by: user?.id,
      })
      .eq("id", flagId);
    await load();
  }, [load]);

  const urgentCount = flags.filter(f =>
    new Date(f.purge_after) < new Date(Date.now() + 7 * 86400000)
  ).length;

  return { flags, loading, urgentCount, dismissFlag, refresh: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA PROCESSING RECORDS (Article 30 RoPA)
// ─────────────────────────────────────────────────────────────────────────────

export function useDataProcessingRecords() {
  const [records, setRecords] = useState<DataProcessingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("data_processing_records")
      .select("*")
      .order("activity_name");
    setRecords(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createRecord = useCallback(async (
    payload: Omit<DataProcessingRecord, "id" | "agency_id" | "created_at" | "updated_at">
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!profile) return null;

    const { data } = await supabase
      .from("data_processing_records")
      .insert({ ...payload, agency_id: profile.agency_id })
      .select()
      .single();
    await load();
    return data;
  }, [load]);

  const updateRecord = useCallback(async (id: string, updates: Partial<DataProcessingRecord>) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("data_processing_records")
      .update({
        ...updates,
        last_reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await load();
  }, [load]);

  const needsReviewCount = records.filter(r =>
    r.is_active && (!r.last_reviewed_at ||
    new Date(r.last_reviewed_at) < new Date(Date.now() - 365 * 86400000))
  ).length;

  return {
    records, loading,
    createRecord, updateRecord,
    needsReviewCount,
    refresh: load,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE INCIDENTS (Breach Response)
// ─────────────────────────────────────────────────────────────────────────────

export function useComplianceIncidents(filters?: { status?: IncidentStatus }) {
  const [incidents, setIncidents] = useState<ComplianceIncident[]>([]);
  const [loading, setLoading]     = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("compliance_incidents")
      .select("*")
      .order("discovered_at", { ascending: false });
    if (filters?.status) query = query.eq("status", filters.status);

    const { data } = await query;
    const now = new Date();

    const enriched = (data ?? []).map(inc => ({
      ...inc,
      hours_to_deadline: inc.incident_type === "data_breach"
        ? Math.round((new Date(inc.authority_notify_deadline).getTime() - now.getTime()) / 3600000)
        : undefined,
      is_past_deadline: inc.incident_type === "data_breach" &&
        new Date(inc.authority_notify_deadline) < now &&
        !inc.notified_authority_at,
    }));
    setIncidents(enriched);
    setLoading(false);
  }, [filters?.status]);

  useEffect(() => { load(); }, [load]);

  const createIncident = useCallback(async (
    payload: Pick<ComplianceIncident,
      "incident_type" | "severity" | "title" | "description" |
      "affected_systems" | "affected_records_estimate"
    >
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("users").select("agency_id").eq("id", user.id).single();
    if (!profile) return null;

    const { data } = await supabase
      .from("compliance_incidents")
      .insert({
        ...payload,
        agency_id: profile.agency_id,
        status: "open",
        discovered_by: user.id,
        assigned_to: user.id,
      })
      .select()
      .single();
    await load();
    return data;
  }, [load]);

  const updateIncident = useCallback(async (
    id: string,
    updates: Partial<ComplianceIncident>
  ) => {
    await supabase
      .from("compliance_incidents")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    await load();
  }, [load]);

  const markContained = useCallback(async (id: string, rootCause: string, steps: string) => {
    await supabase
      .from("compliance_incidents")
      .update({
        status: "contained",
        contained_at: new Date().toISOString(),
        root_cause: rootCause,
        remediation_steps: steps,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await load();
  }, [load]);

  const markAuthorityNotified = useCallback(async (id: string, reference: string) => {
    await supabase
      .from("compliance_incidents")
      .update({
        status: "reported_to_authority",
        notified_authority_at: new Date().toISOString(),
        authority_reference: reference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    await load();
  }, [load]);

  const openBreaches = incidents.filter(
    i => i.incident_type === "data_breach" && !["resolved","closed"].includes(i.status)
  );
  const pastDeadlineCount = incidents.filter(i => i.is_past_deadline).length;

  return {
    incidents, loading,
    createIncident, updateIncident,
    markContained, markAuthorityNotified,
    openBreaches, pastDeadlineCount,
    refresh: load,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD-LEVEL ENCRYPTION UTILITIES
// AES-GCM using Web Crypto API — mirrors the pattern already used for
// email OAuth tokens in the email integration layer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a per-field encryption key from the agency's master key material.
 * In production, the keyMaterial should come from an env secret per agency.
 */
async function deriveKey(keyMaterial: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyMaterial),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptField(
  plaintext: string,
  keyMaterial: string,
  agencyId: string
): Promise<{ iv: string; ciphertext: string; tag: string }> {
  const key = await deriveKey(keyMaterial, agencyId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherbuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );

  // AES-GCM appends 16-byte auth tag at end of ciphertext
  const cipherArr  = new Uint8Array(cipherbuf);
  const cipherOnly = cipherArr.slice(0, -16);
  const tag        = cipherArr.slice(-16);

  const b64 = (buf: Uint8Array) => btoa(String.fromCharCode(...buf));
  return {
    iv:         b64(iv),
    ciphertext: b64(cipherOnly),
    tag:        b64(tag),
  };
}

export async function decryptField(
  encrypted: { iv: string; ciphertext: string; tag: string },
  keyMaterial: string,
  agencyId: string
): Promise<string> {
  const key = await deriveKey(keyMaterial, agencyId);
  const b64ToArr = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  const iv         = b64ToArr(encrypted.iv);
  const cipherOnly = b64ToArr(encrypted.ciphertext);
  const tag        = b64ToArr(encrypted.tag);

  // Reconstitute: ciphertext + tag
  const full = new Uint8Array(cipherOnly.length + tag.length);
  full.set(cipherOnly);
  full.set(tag, cipherOnly.length);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, full);
  return new TextDecoder().decode(decrypted);
}

/**
 * Hook to read/write encrypted fields on a candidate record.
 * Wraps the JSONB encrypted_fields column.
 */
export function useCandidateEncryptedFields(candidateId: string) {
  const [fields, setFields]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Key material: in production, pull from process.env.CANDIDATE_FIELD_ENCRYPTION_KEY
  // For now use a placeholder — the build agent will wire the real env var
  const keyMaterial = process.env.NEXT_PUBLIC_FIELD_ENCRYPTION_KEY ?? "placeholder-replace-with-env";

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("candidates")
      .select("id, encrypted_fields, agency_id")
      .eq("id", candidateId)
      .single();

    if (!data?.encrypted_fields || !data.agency_id) {
      setFields({});
      setLoading(false);
      return;
    }

    // Decrypt each field present
    const decrypted: Record<string, string> = {};
    for (const [fieldName, encValue] of Object.entries(data.encrypted_fields as Record<string, { iv: string; ciphertext: string; tag: string }>)) {
      try {
        decrypted[fieldName] = await decryptField(encValue, keyMaterial, data.agency_id);
      } catch {
        decrypted[fieldName] = "[encrypted]";
      }
    }
    setFields(decrypted);
    setLoading(false);
  }, [candidateId, keyMaterial]);

  useEffect(() => { load(); }, [load]);

  const setEncryptedField = useCallback(async (
    fieldName: string,
    value: string
  ) => {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("agency_id, encrypted_fields")
      .eq("id", candidateId)
      .single();
    if (!candidate) return;

    const encrypted = await encryptField(value, keyMaterial, candidate.agency_id);
    const updatedFields = {
      ...(candidate.encrypted_fields as Record<string, unknown> ?? {}),
      [fieldName]: encrypted,
    };

    await supabase
      .from("candidates")
      .update({ encrypted_fields: updatedFields, updated_at: new Date().toISOString() })
      .eq("id", candidateId);

    setFields(prev => ({ ...prev, [fieldName]: value }));
  }, [candidateId, keyMaterial]);

  const clearEncryptedField = useCallback(async (fieldName: string) => {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("encrypted_fields")
      .eq("id", candidateId)
      .single();
    if (!candidate) return;

    const updated = { ...(candidate.encrypted_fields as Record<string, unknown> ?? {}) };
    delete updated[fieldName];

    await supabase
      .from("candidates")
      .update({ encrypted_fields: updated, updated_at: new Date().toISOString() })
      .eq("id", candidateId);

    setFields(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, [candidateId]);

  return { fields, loading, setEncryptedField, clearEncryptedField, refresh: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE SUMMARY HOOK
// Aggregates all compliance signals for the dashboard header.
// ─────────────────────────────────────────────────────────────────────────────

export function useComplianceSummary() {
  const [summary, setSummary]   = useState<{
    open_dsars: number;
    overdue_dsars: number;
    open_breaches: number;
    past_deadline_breaches: number;
    retention_flags: number;
    processing_records_needing_review: number;
    enforcement_enabled: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();

    const [dsars, incidents, retFlags, processingRecs, policy] = await Promise.all([
      supabase.from("privacy_requests")
        .select("id, status, due_at", { count: "exact" })
        .not("status", "in", '("fulfilled","denied","cancelled")'),
      supabase.from("compliance_incidents")
        .select("id, incident_type, status, authority_notify_deadline, notified_authority_at")
        .not("status", "in", '("resolved","closed")'),
      supabase.from("candidate_retention_flags")
        .select("id", { count: "exact" })
        .is("purged_at", null)
        .is("dismissed_at", null),
      supabase.from("data_processing_records")
        .select("id, last_reviewed_at")
        .eq("is_active", true),
      supabase.from("data_retention_policies")
        .select("enforcement_enabled")
        .single(),
    ]);

    const openDsars = dsars.data ?? [];
    const openBreaches = (incidents.data ?? []).filter(
      i => i.incident_type === "data_breach" && !["resolved","closed"].includes(i.status)
    );
    const pastDeadline = openBreaches.filter(
      i => new Date(i.authority_notify_deadline) < new Date(now) && !i.notified_authority_at
    );
    const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString();

    setSummary({
      open_dsars:                       openDsars.length,
      overdue_dsars:                    openDsars.filter(r => new Date(r.due_at) < new Date(now)).length,
      open_breaches:                    openBreaches.length,
      past_deadline_breaches:           pastDeadline.length,
      retention_flags:                  retFlags.count ?? 0,
      processing_records_needing_review: (processingRecs.data ?? []).filter(
        r => !r.last_reviewed_at || r.last_reviewed_at < yearAgo
      ).length,
      enforcement_enabled:              policy.data?.enforcement_enabled ?? false,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { summary, loading, refresh: load };
}
