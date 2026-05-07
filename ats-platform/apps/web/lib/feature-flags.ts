/**
 * Feature flags & plan gating for the ATS platform.
 *
 * Plans: starter → growth → pro → enterprise
 *
 * Each feature specifies the minimum plan required to use it.
 * Per-agency overrides can be stored in agencies.feature_overrides jsonb.
 */

export const PLANS = ["starter", "growth", "pro", "enterprise"] as const;
export type Plan = typeof PLANS[number];

const PLAN_RANK: Record<Plan, number> = {
  starter:    0,
  growth:     1,
  pro:        2,
  enterprise: 3,
};

export function planAtLeast(current: Plan | null | undefined, required: Plan): boolean {
  if (!current) return false;
  return PLAN_RANK[current] >= PLAN_RANK[required];
}

// ─── Feature definitions ──────────────────────────────────────────────────────

export type FeatureKey =
  // Starter features (all plans)
  | "candidates"
  | "jobs"
  | "pipeline"
  | "client_portal"
  | "email_outreach"
  | "tags"
  | "custom_fields"
  | "duplicate_detection"

  // Growth features
  | "ai_match_scoring"
  | "workflow_automation"
  | "analytics"
  | "submission_pack"
  | "scorecard_templates"
  | "candidate_compare"
  | "saved_searches"
  // US-514: granular AI feature keys for clearer upgrade messaging. All
  // Growth-tier — each route still has its own requirePlan() guard, but
  // these keys let finance override a single AI product (e.g. turn
  // jd_generator on for an eval agency without unlocking the full suite).
  | "ai_jd_generator"
  | "ai_bias_checker"
  | "ai_weekly_status"
  | "ai_resume_parser"
  | "ai_skill_normalise"
  | "ai_boolean_search"
  | "ai_talent_query"
  | "ai_find_similar"

  // Pro features
  | "multi_meeting_integration"
  | "esignature_integration"
  | "candidate_login_portal"
  | "placement_guarantee_workflow"
  | "commission_split_tracking"
  | "business_development"
  | "pipeline_health_scoring"
  | "alerts_escalations"
  | "stage_prep_library"
  | "submission_readiness_checklist"
  | "team_pods"
  | "executive_dashboard"

  // Enterprise features
  | "white_label"
  | "sso"
  | "audit_log"
  | "api_access"
  | "custom_integrations";

interface FeatureDef {
  key:          FeatureKey;
  label:        string;
  description:  string;
  minPlan:      Plan;
  upgradeNote?: string;
}

export const FEATURES: Record<FeatureKey, FeatureDef> = {
  // ── Starter ────────────────────────────────────────────────────────────────
  candidates:          { key: "candidates",          label: "Candidates",          description: "Full candidate management",               minPlan: "starter"    },
  jobs:                { key: "jobs",                label: "Jobs",                description: "Job requisition management",              minPlan: "starter"    },
  pipeline:            { key: "pipeline",            label: "Pipeline",            description: "Drag-and-drop pipeline stages",           minPlan: "starter"    },
  client_portal:       { key: "client_portal",       label: "Client Portal",       description: "Share candidates with clients",           minPlan: "starter"    },
  email_outreach:      { key: "email_outreach",      label: "Email Outreach",      description: "Email integration & auto-logging",        minPlan: "starter"    },
  tags:                { key: "tags",                label: "Tags",                description: "Tag candidates and jobs",                 minPlan: "starter"    },
  custom_fields:       { key: "custom_fields",       label: "Custom Fields",       description: "Add custom data fields",                  minPlan: "starter"    },
  duplicate_detection: { key: "duplicate_detection", label: "Duplicate Detection", description: "Find and merge duplicate candidates",     minPlan: "starter"    },

  // ── Growth ─────────────────────────────────────────────────────────────────
  ai_match_scoring:    { key: "ai_match_scoring",    label: "AI Match Scoring",    description: "AI-powered candidate-to-job matching",    minPlan: "growth", upgradeNote: "Upgrade to Growth to unlock AI-powered matching"      },
  workflow_automation: { key: "workflow_automation", label: "Workflow Automation", description: "Build automated recruiting workflows",     minPlan: "growth", upgradeNote: "Upgrade to Growth to automate your workflows"         },
  analytics:           { key: "analytics",           label: "Analytics",           description: "Pipeline and performance analytics",      minPlan: "growth", upgradeNote: "Upgrade to Growth to access analytics"               },
  submission_pack:     { key: "submission_pack",     label: "Submission Pack",     description: "Branded resume reformatting & packs",     minPlan: "growth", upgradeNote: "Upgrade to Growth for branded submission packs"      },
  scorecard_templates: { key: "scorecard_templates", label: "Scorecard Templates", description: "Reusable interview scorecard templates",  minPlan: "growth", upgradeNote: "Upgrade to Growth for structured interview scorecards" },
  candidate_compare:   { key: "candidate_compare",   label: "Candidate Comparison",description: "Side-by-side candidate comparison",       minPlan: "growth", upgradeNote: "Upgrade to Growth to compare candidates side-by-side"  },
  saved_searches:      { key: "saved_searches",      label: "Saved Searches",      description: "Save and reuse candidate search filters", minPlan: "growth", upgradeNote: "Upgrade to Growth to save searches"                  },

  // US-514: granular AI flags (all Growth tier)
  ai_jd_generator:     { key: "ai_jd_generator",     label: "AI JD Generator",     description: "AI job-description generator & rewriter",  minPlan: "growth", upgradeNote: "Upgrade to Growth to generate job descriptions with AI" },
  ai_bias_checker:     { key: "ai_bias_checker",     label: "AI Bias Checker",     description: "Scan job descriptions for biased language", minPlan: "growth", upgradeNote: "Upgrade to Growth to scan JDs for bias"                },
  ai_weekly_status:    { key: "ai_weekly_status",    label: "AI Weekly Status",    description: "AI-generated weekly status reports",        minPlan: "growth", upgradeNote: "Upgrade to Growth for AI weekly summaries"              },
  ai_resume_parser:    { key: "ai_resume_parser",    label: "AI Resume Parser",    description: "Structured extraction from PDF/DOCX resumes", minPlan: "growth", upgradeNote: "Upgrade to Growth for AI resume parsing"              },
  ai_skill_normalise:  { key: "ai_skill_normalise",  label: "AI Skill Normaliser", description: "Deduplicate and canonicalise candidate skills", minPlan: "growth", upgradeNote: "Upgrade to Growth for AI skill normalisation"        },
  ai_boolean_search:   { key: "ai_boolean_search",   label: "AI Boolean Search",   description: "Natural-language to Boolean search string", minPlan: "growth", upgradeNote: "Upgrade to Growth for AI Boolean search generation"    },
  ai_talent_query:     { key: "ai_talent_query",     label: "AI Talent Query",     description: "Natural-language talent pool search",       minPlan: "growth", upgradeNote: "Upgrade to Growth to search your talent pool in plain English" },
  ai_find_similar:     { key: "ai_find_similar",     label: "AI Find Similar",     description: "Find more candidates like this one",        minPlan: "growth", upgradeNote: "Upgrade to Growth for similarity search"                },

  // ── Pro ────────────────────────────────────────────────────────────────────
  multi_meeting_integration:    { key: "multi_meeting_integration",    label: "Meeting Integrations",    description: "Zoom, Teams, Google Meet one-click scheduling", minPlan: "pro", upgradeNote: "Upgrade to Pro for meeting integrations"         },
  esignature_integration:       { key: "esignature_integration",       label: "E-Signature",             description: "DocuSign / HelloSign integration",              minPlan: "pro", upgradeNote: "Upgrade to Pro for e-signature integrations"     },
  candidate_login_portal:       { key: "candidate_login_portal",       label: "Candidate Portal",        description: "Candidates log in to see their stage status",   minPlan: "pro", upgradeNote: "Upgrade to Pro for the candidate self-service portal" },
  placement_guarantee_workflow: { key: "placement_guarantee_workflow", label: "Guarantee Workflow",      description: "Placement guarantee & replacement tracking",    minPlan: "pro", upgradeNote: "Upgrade to Pro for guarantee tracking"           },
  commission_split_tracking:    { key: "commission_split_tracking",    label: "Commission Tracking",     description: "Commission splits, invoices & payouts",         minPlan: "pro", upgradeNote: "Upgrade to Pro for commission tracking"          },
  business_development:         { key: "business_development",         label: "BD Pipeline",             description: "Business development & prospect pipeline",      minPlan: "pro", upgradeNote: "Upgrade to Pro for business development tools"    },
  pipeline_health_scoring:      { key: "pipeline_health_scoring",      label: "Pipeline Health",         description: "At-risk requisition alerts & health scores",    minPlan: "pro", upgradeNote: "Upgrade to Pro for pipeline health scoring"      },
  alerts_escalations:           { key: "alerts_escalations",           label: "Alerts & Escalations",    description: "Automated alerts and escalation rules",         minPlan: "pro", upgradeNote: "Upgrade to Pro for alerts & escalations"         },
  stage_prep_library:           { key: "stage_prep_library",           label: "Stage Prep Library",      description: "Interview prep content library for candidates", minPlan: "pro", upgradeNote: "Upgrade to Pro for stage prep content"           },
  submission_readiness_checklist:{ key: "submission_readiness_checklist", label: "Readiness Checklist", description: "Pre-submission candidate readiness checklist",  minPlan: "pro", upgradeNote: "Upgrade to Pro for submission readiness checklists" },
  team_pods:                    { key: "team_pods",                    label: "Team Pods",               description: "Team / pod hierarchy and roles",                minPlan: "pro", upgradeNote: "Upgrade to Pro for team pod hierarchy"           },
  executive_dashboard:          { key: "executive_dashboard",          label: "Executive Dashboard",     description: "Firm-wide executive performance dashboard",     minPlan: "pro", upgradeNote: "Upgrade to Pro for the executive dashboard"      },

  // ── Enterprise ─────────────────────────────────────────────────────────────
  white_label:         { key: "white_label",         label: "White Label",         description: "Custom branding & white-label portal",    minPlan: "enterprise", upgradeNote: "Contact sales for white-label"                        },
  sso:                 { key: "sso",                 label: "SSO / SAML",          description: "SAML-based single sign-on",               minPlan: "enterprise", upgradeNote: "Contact sales for SSO"                                },
  audit_log:           { key: "audit_log",           label: "Audit Log",           description: "Full activity audit trail",               minPlan: "enterprise", upgradeNote: "Upgrade to Enterprise for audit logs"                 },
  api_access:          { key: "api_access",          label: "API Access",          description: "REST API access for integrations",        minPlan: "enterprise", upgradeNote: "Upgrade to Enterprise for API access"                 },
  custom_integrations: { key: "custom_integrations", label: "Custom Integrations", description: "Bespoke integrations & webhooks",         minPlan: "enterprise", upgradeNote: "Contact sales for custom integrations"               },
};

/**
 * Check whether a given plan has access to a feature,
 * considering optional per-agency overrides.
 */
export function hasFeature(
  plan:      Plan | null | undefined,
  feature:   FeatureKey,
  overrides?: Record<string, boolean>,
): boolean {
  // Explicit override takes precedence
  if (overrides?.[feature] === true)  return true;
  if (overrides?.[feature] === false) return false;

  const def = FEATURES[feature];
  if (!def) return false;
  return planAtLeast(plan, def.minPlan);
}
