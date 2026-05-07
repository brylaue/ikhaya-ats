import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  varchar,
  decimal,
  index,
} from "drizzle-orm/pg-core";

// Agencies
export const agencies = pgTable(
  "agencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logoUrl: text("logo_url"),
    timezone: varchar("timezone", { length: 50 }).default("UTC"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index("agencies_slug_idx").on(t.slug),
  })
);

// Users
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    email: text("email").notNull().unique(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").notNull(),
    avatarUrl: text("avatar_url"),
    role: varchar("role", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    agencyIdIdx: index("users_agency_id_idx").on(t.agencyId),
    emailIdx: index("users_email_idx").on(t.email),
  })
);

// Clients (Companies)
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    name: text("name").notNull(),
    domain: text("domain"),
    logoUrl: text("logo_url"),
    industry: text("industry"),
    size: varchar("size", { length: 50 }),
    primaryContactId: uuid("primary_contact_id"),
    portalSlug: varchar("portal_slug", { length: 100 }).unique(),
    portalDomain: text("portal_domain"),
    portalBrandColor: varchar("portal_brand_color", { length: 7 }),
    healthScore: integer("health_score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    agencyIdIdx: index("clients_agency_id_idx").on(t.agencyId),
    portalSlugIdx: index("clients_portal_slug_idx").on(t.portalSlug),
  })
);

// Contacts at clients
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    avatarUrl: text("avatar_url"),
    isPortalUser: boolean("is_portal_user").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    clientIdIdx: index("contacts_client_id_idx").on(t.clientId),
  })
);

// Jobs (Requisitions)
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    type: varchar("type", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    priority: varchar("priority", { length: 20 }).notNull(),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: varchar("salary_currency", { length: 3 }).default("USD"),
    estimatedFee: integer("estimated_fee"),
    feeProbability: integer("fee_probability"),
    targetStartDate: timestamp("target_start_date"),
    ownerId: uuid("owner_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    agencyIdIdx: index("jobs_agency_id_idx").on(t.agencyId),
    clientIdIdx: index("jobs_client_id_idx").on(t.clientId),
    ownerIdIdx: index("jobs_owner_id_idx").on(t.ownerId),
    statusIdx: index("jobs_status_idx").on(t.status),
  })
);

// Pipeline stages
export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    name: text("name").notNull(),
    order: integer("order").notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    color: varchar("color", { length: 7 }),
    slaDays: integer("sla_days"),
  },
  (t) => ({
    jobIdIdx: index("pipeline_stages_job_id_idx").on(t.jobId),
  })
);

// Candidates
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    currentTitle: text("current_title"),
    currentCompany: text("current_company"),
    location: jsonb("location"),
    avatarUrl: text("avatar_url"),
    linkedinUrl: text("linkedin_url"),
    portfolioUrl: text("portfolio_url"),
    status: varchar("status", { length: 50 }).notNull(),
    source: text("source"),
    summary: text("summary"),
    currentSalary: integer("current_salary"),
    desiredSalary: integer("desired_salary"),
    salaryCurrency: varchar("salary_currency", { length: 3 }).default("USD"),
    openToRemote: boolean("open_to_remote").default(false),
    ownerId: uuid("owner_id").references(() => users.id),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    agencyIdIdx: index("candidates_agency_id_idx").on(t.agencyId),
    emailIdx: index("candidates_email_idx").on(t.email),
    ownerIdIdx: index("candidates_owner_id_idx").on(t.ownerId),
    statusIdx: index("candidates_status_idx").on(t.status),
  })
);

// Tags
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    name: text("name").notNull(),
    color: varchar("color", { length: 7 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    agencyIdIdx: index("tags_agency_id_idx").on(t.agencyId),
  })
);

// Candidate pipeline entries (applications)
export const candidatePipelineEntries = pgTable(
  "candidate_pipeline_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    status: varchar("status", { length: 50 }).notNull(),
    score: integer("score"),
    recruiterNote: text("recruiter_note"),
    daysInStage: integer("days_in_stage").default(0),
    appliedAt: timestamp("applied_at").notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at"),
    submittedToClientAt: timestamp("submitted_to_client_at"),
    clientDecision: varchar("client_decision", { length: 20 }),
    clientDecisionReason: text("client_decision_reason"),
    clientDecisionNote: text("client_decision_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    candidateIdIdx: index("cpe_candidate_id_idx").on(t.candidateId),
    jobIdIdx: index("cpe_job_id_idx").on(t.jobId),
    stageIdIdx: index("cpe_stage_id_idx").on(t.stageId),
    statusIdx: index("cpe_status_idx").on(t.status),
  })
);

// Portal feedback
export const portalFeedback = pgTable(
  "portal_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => candidatePipelineEntries.id),
    decision: varchar("decision", { length: 20 }).notNull(),
    reason: text("reason"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    applicationIdIdx: index("portal_feedback_application_id_idx").on(
      t.applicationId
    ),
  })
);

// Activities
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    type: varchar("type", { length: 50 }).notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    agencyIdIdx: index("activities_agency_id_idx").on(t.agencyId),
    entityIdx: index("activities_entity_idx").on(t.entityType, t.entityId),
  })
);

// Placements
export const placements = pgTable(
  "placements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    placedDate: timestamp("placed_date").notNull().defaultNow(),
    startDate: timestamp("start_date"),
    salary: integer("salary"),
    feePaid: boolean("fee_paid").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    jobIdIdx: index("placements_job_id_idx").on(t.jobId),
    candidateIdIdx: index("placements_candidate_id_idx").on(t.candidateId),
  })
);
