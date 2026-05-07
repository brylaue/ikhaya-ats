"use client";

import { useState } from "react";
import {
  HelpCircle, Search, BookOpen, Zap, Keyboard, MessageCircle,
  ChevronRight, ChevronDown, ExternalLink, Users, Briefcase,
  Kanban, BarChart3, Mail, Building2, Play, CheckCircle2,
  ArrowRight, Send, Bug, Workflow, Settings, Globe, Shield,
  AlertCircle, Info, Clock, FileText, Star, Video, Calendar,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  summary: string;
  category: string;
  readMins: number;
  videoUrl?: string;
  content: string[];
  tips?: string[];
  relatedIds?: string[];
}

interface WorkflowStep {
  title: string;
  detail: string;
  link?: { label: string; href: string };
}

interface WorkflowGuide {
  id: string;
  title: string;
  summary: string;
  icon: React.ElementType;
  duration: string;
  steps: WorkflowStep[];
}

interface Shortcut {
  keys: string[];
  label: string;
}

interface FAQ {
  q: string;
  a: string;
  category: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all",              label: "All",                icon: BookOpen    },
  { id: "getting-started",  label: "Getting Started",    icon: Zap         },
  { id: "candidates",       label: "Candidates",         icon: Users       },
  { id: "jobs",             label: "Jobs",               icon: Briefcase   },
  { id: "pipeline",         label: "Pipeline",           icon: Kanban      },
  { id: "clients",          label: "Clients",            icon: Building2   },
  { id: "outreach",         label: "Outreach",           icon: Mail        },
  { id: "analytics",        label: "Analytics",          icon: BarChart3   },
  { id: "email-sync",       label: "Email Integration",  icon: Shield      },
  { id: "settings",         label: "Settings",           icon: Settings    },
  { id: "portal",           label: "Client Portal",      icon: Globe       },
  { id: "interviews",       label: "Interviews",         icon: Calendar    },
  { id: "placements",       label: "Placements",         icon: CheckCircle2 },
  { id: "sourcing",         label: "Sourcing",           icon: Search      },
  { id: "reports",          label: "Reports",            icon: FileText    },
  { id: "ai",               label: "AI Copilot",         icon: Zap         },
  { id: "bd",               label: "Business Development", icon: TrendingUp },
];

const FAQ_CATEGORIES = ["All", "Candidates & Jobs", "Pipeline", "Email Integration", "Portal", "Interviews & Placements", "Reports & AI", "Data & Security", "Business Development", "Compliance & Admin"];

// ─── Articles ─────────────────────────────────────────────────────────────────

const ARTICLES: Article[] = [
  // ── Getting Started ──
  {
    id: "gs1",
    category: "getting-started",
    title: "Welcome to Ikhaya — your first 20 minutes",
    summary: "Get your agency fully set up and make your first placement in under 20 minutes.",
    readMins: 5,
    videoUrl: "https://docs.ikhaya.io/tutorials/getting-started",
    content: [
      "Start by setting up your agency profile in Settings → Org. Add your agency name and portal subdomain so clients see your brand on all submitted candidate profiles.",
      "Invite your team in Settings → Team & Access. Each recruiter gets their own login and you control which features they can access.",
      "Import your existing candidate database via Candidates → Import CSV. We auto-map columns from LinkedIn Recruiter, Bullhorn, Greenhouse, Lever, and plain Excel exports.",
      "Create your first job search under Jobs → New Search. The 4-step wizard walks you through role, compensation, team assignment, and pipeline stages.",
      "Submit a candidate to a client from the job pipeline. They'll receive a branded portal link to review the profile and leave advance/hold/pass feedback.",
    ],
    tips: [
      "Use ⌘K (global search) to jump to any candidate, job, or client instantly.",
      "Press ? anywhere in the app to open the keyboard shortcuts panel.",
    ],
  },
  {
    id: "gs2",
    category: "getting-started",
    title: "Inviting your team and setting up roles",
    summary: "Add recruiters and admins, understand permissions, and keep data clean from day one.",
    readMins: 3,
    content: [
      "Go to Settings → Team & Access. Click Invite Member and enter the recruiter's email address.",
      "Choose a role: Admin (full access including billing and settings) or Recruiter (access to candidates, jobs, pipeline, outreach, and analytics).",
      "The invited user receives an email with a secure sign-in link. They'll be prompted to set a password on first login.",
      "Each recruiter's activity is attributed to them individually in the activity timeline and analytics. This means performance reports are accurate from day one.",
      "To remove a team member, click the ⋯ menu next to their name and select Remove. Their historical activity is preserved — only future access is revoked.",
    ],
    tips: ["Admins can see billing and settings; Recruiters cannot. Use Recruiter role for anyone who doesn't need to manage the account."],
  },
  {
    id: "gs3",
    category: "getting-started",
    title: "Configuring your agency profile and portal brand",
    summary: "Set your portal subdomain, logo, and agency name so clients see your brand.",
    readMins: 2,
    content: [
      "Go to Settings → Org. Set your agency name exactly as you want clients to see it on the portal.",
      "Choose a portal subdomain (e.g., your agency name). Clients will access the portal at youragency.ikhaya.io.",
      "Upload your agency logo. It appears on the client portal header and on candidate submission emails.",
      "Set your primary contact email — this is the reply-to address on automated portal notifications sent to clients.",
    ],
  },

  // ── Candidates ──
  {
    id: "c1",
    category: "candidates",
    title: "Importing candidates from LinkedIn Recruiter",
    summary: "Export your LinkedIn Recruiter list and bring it into Ikhaya in 3 steps.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/import-linkedin",
    content: [
      "In LinkedIn Recruiter, select the candidates you want to export using the checkboxes, then click Export at the top right.",
      "Download the CSV. It will contain columns like First Name, Last Name, Current Title, Company, Location, and LinkedIn Profile URL.",
      "In Ikhaya, go to Candidates → Import CSV. Upload the file — we auto-detect LinkedIn column headers and pre-map them for you.",
      "Step 2 of the import lets you review and correct column mappings. Step 3 shows a preview of the first 10 rows before you confirm.",
      "After import, new candidates land in the Candidates list with status 'New'. Duplicates (matched by email) are flagged for review rather than overwritten.",
    ],
    tips: [
      "The import also accepts exports from Bullhorn, Greenhouse, Lever, PCRecruiter, and plain Excel. Column names don't need to be exact — we fuzzy-match them.",
    ],
  },
  {
    id: "c2",
    category: "candidates",
    title: "Saving candidate searches with alerts",
    summary: "Save filtered views and get notified when new candidates match your criteria.",
    readMins: 2,
    content: [
      "Apply filters on the Candidates page (name, status, source, location). Once you have an active filter, the Save button appears in the header.",
      "Click Save, give the search a name, and choose whether to enable alerts: instant, daily digest, or weekly digest.",
      "Saved searches appear in the Saved panel. Re-apply a search in one click, toggle alerts on/off, or delete it.",
      "Alert emails contain a direct link back into Ikhaya filtered to the exact matching candidates.",
    ],
  },
  {
    id: "c3",
    category: "candidates",
    title: "Using the candidate activity timeline",
    summary: "See the full history of every interaction — notes, emails, pipeline moves, submissions, and tasks.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/activity-timeline",
    content: [
      "Open any candidate profile. The right column shows the Activity Timeline — a reverse-chronological feed of everything that's happened.",
      "Use the filter chips at the top of the timeline to narrow to a specific type: Notes, Emails, Pipeline moves, Submissions, or Tasks.",
      "Add a note using the composer at the top. Notes support @mentions for team members and can be marked as internal (not visible to clients).",
      "Emails synced from Gmail or Outlook appear automatically in the timeline once you connect your email in Settings → Integrations.",
      "Each timeline entry shows the date, the team member who made the action, and the full detail. Pipeline moves show the from/to stage.",
    ],
    tips: ["Use ⌘+Enter to save a note quickly without clicking Save."],
  },
  {
    id: "c4",
    category: "candidates",
    title: "Submitting a candidate to a client",
    summary: "Walk through the 3-step submission flow and what happens after you send.",
    readMins: 4,
    videoUrl: "https://docs.ikhaya.io/tutorials/submit-candidate",
    content: [
      "From a candidate's profile or from the job pipeline, click Submit to Client. The submission modal opens.",
      "Step 1 — Job Select: Choose which job search this submission is for. The candidate must already be in the pipeline for that job, or you can add them during this step.",
      "Step 2 — Cover Note: Write your submission note. Use the template picker to start from a saved template. Highlight the candidate's key strengths using the Highlights section.",
      "Step 3 — Review: Confirm the client contact who will receive the portal notification, then click Submit.",
      "Once submitted, the candidate's stage moves to 'Submitted' in the pipeline. The client receives a branded email with a secure link to the portal. Their feedback (Advance / Hold / Pass) syncs back automatically.",
    ],
    tips: [
      "Create submission templates in Settings → Templates to save time on repeated submissions.",
      "You can re-submit a candidate to the same client (e.g. after updating their profile) — the history is preserved.",
    ],
  },

  // ── Jobs ──
  {
    id: "j1",
    category: "jobs",
    title: "Creating a new search (job)",
    summary: "Walk through the 4-step job creation wizard to set up a new search correctly.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/create-job",
    content: [
      "Click New Search in the Jobs page header. The 4-step wizard opens.",
      "Step 1 — Role: Enter the job title and select the client (required). Set priority (P1–P4), status, location, and remote arrangement.",
      "Step 2 — Comp: Enter the salary range and estimated fee. The probability slider (0–100%) sets your confidence level for revenue forecasting in Analytics.",
      "Step 3 — Team: Assign a recruiter from your team. They become the owner of this search and appear in the pipeline and analytics views.",
      "Step 4 — Pipeline: Review the default stages (Sourced → Screening → Submitted → Interview → Offer → Placed). Custom stages are configured in Settings → Pipeline Stages.",
    ],
    tips: [
      "Set the fee and probability accurately — these feed directly into the Revenue analytics and weighted pipeline forecast.",
    ],
  },
  {
    id: "j2",
    category: "jobs",
    title: "Managing job status and priority",
    summary: "Keep your searches organised with status and priority so your team knows where to focus.",
    readMins: 2,
    content: [
      "Each job has a Status (Active, On Hold, Closed/Filled, Cancelled) and a Priority (P1 = urgent through P4 = low). Both are visible on job cards and in the pipeline view.",
      "Update status or priority inline by clicking the badge on the job card or at the top of the job detail page.",
      "The Jobs list can be filtered and sorted by status, priority, client, and recruiter. Use these together to build focused worklists.",
      "When a placement is confirmed, set the job status to Closed/Filled and record the placed candidate from the pipeline. This triggers revenue realisation in Analytics.",
    ],
  },

  // ── Pipeline ──
  {
    id: "p1",
    category: "pipeline",
    title: "Moving candidates through the pipeline",
    summary: "Drag and drop, or use quick actions to update candidate stages.",
    readMins: 2,
    videoUrl: "https://docs.ikhaya.io/tutorials/pipeline-kanban",
    content: [
      "Open a job and go to the Pipeline tab. You'll see a Kanban board with columns for each stage and candidate cards in each.",
      "Drag a candidate card from one column to another to advance their stage. The move is recorded in their activity timeline automatically.",
      "Use the ⋯ menu on any card for quick actions: Add note, Schedule interview, Submit to client, Flag as stale.",
      "The Funnel tab shows a conversion funnel so you can see where candidates are dropping out of your process — useful for coaching recruiters.",
      "The Tasks tab shows all open tasks associated with this job, across all candidates and team members.",
    ],
    tips: [
      "Color coding on cards: green = moving well, amber = pending action needed, red = stale (no activity in 7+ days).",
    ],
  },
  {
    id: "p2",
    category: "pipeline",
    title: "Reading the Pipeline group-by view",
    summary: "Switch from job-level pipeline to a cross-job view grouped by recruiter, client, or priority.",
    readMins: 2,
    content: [
      "Go to the Pipeline section in the main navigation. This is different from the pipeline tab inside a job — it's a cross-job view.",
      "Use the Group By selector at the top to switch between: By Recruiter, By Client, or By Priority.",
      "Each group shows a KPI strip (active searches, total candidates, submissions this week) and mini pipeline bars for each job.",
      "This view is most useful for agency owners reviewing the whole team's workload in one place.",
    ],
  },

  // ── Clients ──
  {
    id: "cl1",
    category: "clients",
    title: "Setting up the client portal",
    summary: "How clients review submitted candidates and leave feedback.",
    readMins: 4,
    videoUrl: "https://docs.ikhaya.io/tutorials/client-portal",
    content: [
      "When you submit a candidate from the pipeline, the client contact automatically receives an email with a branded portal link. No separate setup needed.",
      "The portal shows the candidate's profile, your submission note, and the highlighted strengths you included. Clients don't need to create an account.",
      "Clients can mark each candidate as Advance, Hold, or Pass, and optionally leave notes explaining their decision.",
      "Feedback syncs back to Ikhaya in real time. The candidate card in the pipeline updates with the decision badge and you receive an in-app notification.",
      "Configure your portal domain in Settings → Org. The URL will be youragency.ikhaya.io/portal/[client-slug].",
    ],
    tips: [
      "Test your portal before sharing with real clients — submit a test candidate and open the portal link to see exactly what they'll see.",
    ],
  },
  {
    id: "cl2",
    category: "clients",
    title: "Managing clients and contacts",
    summary: "Add companies, link contacts, track relationship health.",
    readMins: 3,
    content: [
      "Go to the Clients page. Each row shows a client company with their health score (green/amber/red based on recent activity and open searches).",
      "Click a client to open the detail view. It has four tabs: Overview (KPIs + recent activity), Jobs (all searches for this client), Contacts (hiring managers and stakeholders), and Tasks.",
      "Add a contact in the Contacts tab. Contacts are the people at the client company who receive portal links and feedback notifications.",
      "The health score is calculated from: days since last submission, number of open searches, and pending feedback items. Red = attention needed.",
      "You can link multiple contacts to a single client. When submitting a candidate, you choose which contact to notify.",
    ],
  },

  // ── Outreach ──
  {
    id: "o1",
    category: "outreach",
    title: "Creating and managing email sequences",
    summary: "Automate multi-touch outreach to candidates with personalized sequences.",
    readMins: 4,
    videoUrl: "https://docs.ikhaya.io/tutorials/email-sequences",
    content: [
      "In the Outreach page, go to the Sequences tab and click New Sequence. Name it and build your steps: each step is an email with a wait period before the next.",
      "Each email has a subject and body. Use merge variables to personalize: {{first_name}}, {{job_title}}, {{client_name}}, {{recruiter_name}}.",
      "Activate a sequence and enroll candidates from their profile or directly from the pipeline. Enrolled candidates progress through steps automatically.",
      "Track open rates, reply rates, and click rates per sequence in the sequence analytics panel.",
      "Pause or edit a live sequence at any time — already-sent steps aren't affected. Pausing stops future steps from sending.",
    ],
    tips: [
      "Keep step 1 short (3–4 sentences). Response rates drop significantly with longer first messages.",
    ],
  },
  {
    id: "o2",
    category: "outreach",
    title: "Using the Outreach inbox",
    summary: "Reply to candidate emails, manage conversations, and keep threads in context.",
    readMins: 2,
    content: [
      "Switch to the Inbox tab in Outreach to see all incoming candidate replies to your sequences.",
      "Click any thread to read the full conversation. Reply directly from the inbox — your reply is sent from your connected email address.",
      "Each thread shows which sequence and step triggered the original message, so you always have context.",
      "Threads from candidates who are in your pipeline are linked back to their candidate profile automatically.",
    ],
  },

  // ── Analytics ──
  {
    id: "an1",
    category: "analytics",
    title: "Understanding your revenue pipeline",
    summary: "How Ikhaya calculates weighted pipeline value and forecasting metrics.",
    readMins: 3,
    content: [
      "The Revenue tab in Analytics shows your weighted pipeline — each active job's estimated fee multiplied by its close probability.",
      "Set the fee and probability when creating or editing a job. Probability reflects how confident you are the search will result in a placement.",
      "The Overview KPIs show MoM growth compared to last month's confirmed placements. The pipeline value updates as jobs are won, lost, or progressed.",
      "Confirmed placement revenue is recorded when a job's status is set to Closed/Filled with a placed candidate.",
    ],
  },
  {
    id: "an2",
    category: "analytics",
    title: "Reading the Recruiters performance tab",
    summary: "Track individual recruiter output — submissions, interviews, and placements.",
    readMins: 2,
    content: [
      "Go to Analytics → Recruiters. Each row shows a team member with their key metrics: active searches, submissions this period, interviews scheduled, and placements.",
      "Use the date range picker at the top to compare periods (this month vs. last month, this quarter, etc.).",
      "Click a recruiter row to drill into their individual performance breakdown — which clients, which job types, what conversion rates.",
      "The chart at the top shows submissions and placements over time, stacked by recruiter, so you can spot ramp-up and drop-off patterns.",
    ],
  },

  // ── Email Integration ──
  {
    id: "em1",
    category: "email-sync",
    title: "Connecting your Gmail to Ikhaya",
    summary: "Sync your Gmail inbox so candidate emails appear automatically in their activity timeline.",
    readMins: 4,
    videoUrl: "https://docs.ikhaya.io/tutorials/connect-gmail",
    content: [
      "Go to Settings → Integrations. Under Email Sync, click Connect Gmail.",
      "You'll be redirected to Google's OAuth consent screen. Sign in with the Google Workspace account you use for recruiting emails.",
      "Grant the requested permissions: Ikhaya needs read and modify access to match emails to candidates. No emails are sent on your behalf without explicit action.",
      "After connecting, a backfill starts automatically. Ikhaya scans your Sent Items and Inbox for emails that match candidate addresses already in the system.",
      "Backfill typically completes within a few minutes for most inboxes. New emails are synced in real time going forward via Gmail's push notification system.",
    ],
    tips: [
      "Only emails where the other party is a candidate already in Ikhaya are synced. Personal emails are never stored.",
      "To disconnect, go to Settings → Integrations and click Disconnect. All synced email data is purged immediately.",
    ],
  },
  {
    id: "em2",
    category: "email-sync",
    title: "Connecting Outlook / Microsoft 365",
    summary: "Sync your Microsoft 365 mailbox so candidate emails appear in activity timelines.",
    readMins: 4,
    videoUrl: "https://docs.ikhaya.io/tutorials/connect-outlook",
    content: [
      "Go to Settings → Integrations. Under Email Sync, click Connect Outlook.",
      "You'll be redirected to Microsoft's login. Sign in with your Microsoft 365 (work) account.",
      "If your organization requires admin consent, you'll see an additional screen. Your IT admin may need to approve the Ikhaya app for your tenant — see the setup guide linked below.",
      "After consent is granted, a backfill starts from your Inbox and Sent Items folders. Delta sync keeps things up to date without re-scanning on every run.",
      "New emails are synced in real time via Microsoft Graph webhooks. Subscriptions auto-renew every 12 hours.",
    ],
    tips: [
      "Microsoft tenant-wide admin consent is a one-time step. Once your IT admin approves, all team members at your organization can connect without extra steps.",
    ],
    relatedIds: ["em1"],
  },
  {
    id: "em3",
    category: "email-sync",
    title: "How email matching works",
    summary: "Understand how Ikhaya links emails to the right candidate profiles.",
    readMins: 3,
    content: [
      "When an email is synced, Ikhaya tries to match the sender/recipient email address to a candidate in your database using three methods.",
      "Exact match: the email address is an exact match to a candidate's primary email. This is the most reliable match and is applied automatically.",
      "Alt-email / domain alias match: common variations are normalised (e.g. john@googlemail.com = john@gmail.com). Also applied automatically.",
      "Fuzzy match: Ikhaya flags potential matches where the email domain or name pattern closely resembles a candidate. These land in the Fuzzy Review inbox for your confirmation.",
      "Unmatched emails (no plausible candidate) are not stored. Ikhaya only keeps emails that can be linked to recruiting activity.",
    ],
  },
  {
    id: "em4",
    category: "email-sync",
    title: "Reviewing unmatched emails (Fuzzy Review inbox)",
    summary: "Confirm or reject emails that Ikhaya couldn't auto-match to a candidate.",
    readMins: 2,
    content: [
      "Navigate to /integrations/email/review (or follow the notification banner that appears when unmatched emails are waiting). This is a dedicated inbox — separate from the main Outreach page.",
      "Each row shows: the email subject and a short snippet, the sender address, the date, the confidence score (%), and Ikhaya's best-guess candidate match.",
      "Click Confirm to link the email to the suggested candidate. The email is immediately added to that candidate's activity timeline.",
      "Click Reject to dismiss the match — the email will not be stored anywhere.",
      "Click Reassign to link the email to a different candidate than the one Ikhaya suggested. A search box lets you find the correct candidate. Use this when the system picked the wrong person.",
      "The inbox clears as you process items. A badge count in the Integrations section of the sidebar shows how many items are waiting.",
    ],
  },

  // ── Settings ──
  {
    id: "st1",
    category: "settings",
    title: "Customising pipeline stages",
    summary: "Rename, reorder, or add stages so the pipeline matches your actual process.",
    readMins: 3,
    content: [
      "Go to Settings → Pipeline Stages. The current stage list is shown in order.",
      "Click any stage name to rename it inline. Press Enter to save.",
      "Drag stages to reorder them. The order here is the order they appear in the Kanban pipeline board.",
      "Click + Add Stage to add a new stage. Position it anywhere in the list.",
      "Stages cannot currently be configured per-job — the same stages apply org-wide. Per-job custom stages are on the Q3 roadmap.",
    ],
    tips: [
      "Avoid deleting stages that have candidates in them — move those candidates first. Deleted stages remove the label from historical entries but don't delete the records.",
    ],
  },
  {
    id: "st2",
    category: "settings",
    title: "Email integration admin dashboard",
    summary: "Monitor team email connections, force-disconnect, and view sync health.",
    readMins: 3,
    content: [
      "Admins can go to Settings → Integrations → Email Admin Dashboard to see all team member connections.",
      "The dashboard shows each user's connected provider (Gmail / Outlook / None), connection status (active / error / disconnected), and last sync time.",
      "Use the Force Disconnect button to revoke a user's email connection remotely — for example when a recruiter leaves the team.",
      "The KPI strip at the top shows: total connected users, emails synced this week, and any sync errors in the last 24 hours.",
      "If a user's token has expired or been revoked, an error banner appears in their session. They'll need to reconnect in Settings → Integrations.",
    ],
  },

  // ── Portal ──
  {
    id: "por1",
    category: "portal",
    title: "What clients see on the portal",
    summary: "A walkthrough of the client-facing portal experience from their perspective.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/client-portal-demo",
    content: [
      "When a candidate is submitted, the client contact receives an email with a button linking to the portal. No account creation is needed.",
      "The portal landing page lists all submitted candidates for the relevant job. Each card shows name, title, company, and submission date.",
      "Clicking a candidate opens their full profile: summary, experience, skills, your cover note, and highlighted strengths.",
      "At the bottom of each profile, the client sees three buttons: Advance, Hold, Pass. They can add an optional note with each decision.",
      "The client can return to the portal at any time using the same link. New submissions are added to the list automatically.",
    ],
    tips: [
      "The portal link is unique per client/job combination, not per candidate. One link gives access to all submissions for that search.",
    ],
  },
  {
    id: "por2",
    category: "portal",
    title: "The client candidate comparison view",
    summary: "How clients compare up to three submitted candidates side-by-side and make decisions.",
    readMins: 2,
    content: [
      "From the main portal page, clients can navigate to the Compare view at /portal/[slug]/compare. It shows up to three submitted candidates in a ranked column layout (#1, #2, #3).",
      "Each column shows the candidate's name, current title, company, and your recruiter note from the submission. The ranking is set by submission order — most recent submissions appear first.",
      "At the bottom of each column, the client sees Advance, Hold, and Pass buttons — the same three decisions available on the individual candidate pages. Decisions made here sync back to Ikhaya exactly the same way.",
      "The Compare view is most useful when a client has received three or more submissions and wants to evaluate them together before deciding who to advance to interview.",
    ],
    tips: [
      "Share the compare URL directly with a client after multiple submissions — it's a more decisive experience than reviewing candidates one at a time.",
    ],
  },

  // ── Candidate detail — additional tabs ──
  {
    id: "c5",
    category: "candidates",
    title: "Viewing a candidate's resume",
    summary: "The Resume tab shows a structured view of work history and education pulled from the candidate's profile.",
    readMins: 2,
    content: [
      "Open any candidate profile and click the Resume tab (the fourth tab, with a document icon).",
      "The resume view shows work history as a timeline: company name, job title, dates, location, and bullet points describing the role. Each position is its own card.",
      "Below work history, the Education section shows each degree: school, degree type, field of study, and graduation year.",
      "This data is populated from the candidate's profile fields. If you imported via CSV, the resume content is what mapped into those fields. You can edit the underlying data from the candidate's main profile.",
      "The Resume tab is read-only — use it to review before a submission or to copy content into a cover note without switching tabs.",
    ],
    tips: [
      "Use the Resume tab when writing a submission cover note — you can read the candidate's experience in one tab while composing in the Submit to Client modal.",
    ],
  },
  {
    id: "c7",
    category: "candidates",
    title: "Interview scorecards",
    summary: "View structured interviewer ratings for a candidate across all their interviews.",
    readMins: 2,
    content: [
      "Open a candidate profile and click the Scorecards tab (star icon). Each submitted scorecard is shown as a card with the interviewer, stage, and date.",
      "Every scorecard rates the candidate across six criteria: Communication, Technical Ability, Cultural Fit, Leadership Potential, Motivation & Drive, and Role Alignment. Each is rated 1–5 (Poor → Exceptional) with optional notes per criterion.",
      "Below the criteria ratings, the interviewer records an overall recommendation: Strong Yes, Yes, Maybe, No, or Strong No. The overall score is the average of all criterion ratings.",
      "Scorecards are submitted via the Scorecard modal, which opens from the ⋯ menu on a pipeline card after an interview is logged as Completed.",
      "When multiple interviewers submit scorecards for the same candidate, their scores and recommendations appear side-by-side — making panel debrief decisions straightforward.",
      "Scorecards are strictly internal — they are never visible to the candidate or on the client portal.",
    ],
  },
  {
    id: "c8",
    category: "candidates",
    title: "Offer letters — generating and sending",
    summary: "Create, approve, and send offer letters to candidates directly from their profile.",
    readMins: 3,
    content: [
      "Open a candidate profile and click the Offers tab (signature icon). The Offer modal tracks the full offer lifecycle from creation through acceptance.",
      "Click New Offer to open the offer form. Fill in: base salary, bonus, equity (optional), currency, start date, and offer expiry date. Set the agency fee — either as a percentage of base salary or a flat amount — and choose payment terms (on start, 30 days, 60 days, or on completion). The estimated fee auto-calculates.",
      "Offer status tracks the full lifecycle: Draft → Extended (sent to candidate) → Verbal Accepted → Accepted (signed) or Declined or Countered. Update the status as events happen.",
      "When a candidate counters, log the counter details in the notes field and create a revised offer — both the original and the counter are visible in the tab's history.",
      "When the offer reaches Accepted, the Offers tab shows a confirmation prompt to create the placement record. This links the offer terms to the Placements page and kicks off the billing workflow.",
    ],
    tips: [
      "Log Verbal Accepted as soon as the candidate says yes verbally — this gives your team and the client a clear signal before paperwork is complete.",
      "Set up your offer letter template in Settings before generating your first offer — the template controls formatting and standard legal boilerplate.",
    ],
  },

  {
    id: "c9",
    category: "candidates",
    title: "Sending availability to a candidate",
    summary: "Share a set of interview time slots with a candidate in one click using the availability grid.",
    readMins: 2,
    content: [
      "From a candidate's profile or from a pipeline card, open the Outreach modal (the calendar/link icon). This is separate from email sequences — it's for sending a one-off availability request.",
      "The modal shows a 5-day grid of the next business days with hourly slots from 9am to 5pm. Click any slot to select it — you can select as many as you like across multiple days.",
      "Once you've selected slots, the modal formats them as a clean, readable list (e.g. 'Tuesday April 23 at 2:00 PM'). Click Copy to copy the formatted list to your clipboard, or click Send to compose an email with the slots pre-filled in the body.",
      "Using Send opens the Email Compose modal with the slots already in the body. Add any context, adjust the subject line, and send.",
    ],
    tips: [
      "Select 3–5 slots across different days to give candidates enough flexibility — availability requests with fewer than 3 options have a lower response rate.",
    ],
  },

  // ── Pipeline health ──
  {
    id: "p3",
    category: "pipeline",
    title: "Pipeline health scores and at-risk alerts",
    summary: "Understand the health scoring system that flags stalled and critical searches before they slip.",
    readMins: 3,
    content: [
      "Every active job in Ikhaya has a Pipeline Health score (0–100) displayed as a badge: green (Healthy), amber (At Risk), or red (Critical). The score appears on job cards, the Pipeline group-by view, and the Dashboard.",
      "The score is calculated from factors like: days since last candidate activity, number of candidates in late stages vs. early stages, submission-to-feedback lag, and how many stage-level SLA targets have been breached.",
      "Healthy (green, 70–100): the search is progressing well — candidates are moving, client feedback is timely.",
      "At Risk (amber, 40–69): something has stalled — a candidate has been in a stage too long, or client feedback is overdue. The search needs a check-in.",
      "Critical (red, 0–39): the search has significant problems — multiple SLA breaches, no recent activity, or the search is at risk of being lost. Immediate action recommended.",
      "The Dashboard's Pipeline Health panel automatically surfaces all At Risk and Critical searches so you can see what needs attention without hunting through every job.",
    ],
    tips: [
      "Set realistic SLA targets in Settings → Pipeline Stages. If targets are too aggressive, most jobs will show amber even when healthy — making the signal useless.",
    ],
  },

  // ── Jobs — additional tabs ──
  {
    id: "j3",
    category: "jobs",
    title: "Using the Match tab to find candidates for a job",
    summary: "AI-scored talent matching that ranks your existing candidate database against a specific job's requirements.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/job-match",
    content: [
      "Open any job and click the Match tab (fourth tab). Ikhaya scores every candidate in your database against this job's requirements.",
      "Each candidate card shows a match score (0–100), a list of matched skills, a list of missing skills, and a plain-English fit reason explaining the score.",
      "The tab badge shows how many candidates score 60 or above — these are your strongest matches at a glance.",
      "Filter the list by minimum score or skill using the controls at the top of the tab. Sort by score (default) or by candidate name.",
      "Click Add to Pipeline on any candidate card to immediately add them to this job's pipeline at the Sourced stage. You can add multiple candidates in one session.",
    ],
    tips: [
      "Match scores are based on the candidate data in Ikhaya — the more complete each profile, the more accurate the score. Incomplete profiles score lower even if the person is a great fit.",
      "Use the Match tab at the start of every new search before sourcing externally — you may already have the right candidate in your database.",
    ],
  },

  // ── Analytics — additional tabs ──
  {
    id: "an3",
    category: "analytics",
    title: "Analytics: Clients tab",
    summary: "See revenue, placement counts, pipeline depth, and engagement health per client company.",
    readMins: 2,
    content: [
      "Go to Analytics → Clients tab. The KPI strip shows four numbers for the selected period: Active Clients, Open Searches, Total Placements, and Total Fees collected.",
      "The Client Health table shows one row per client with: total jobs, open jobs, candidate count, placements, average fill time (days), and total fees earned.",
      "An Engagement Insight banner appears automatically when clients have candidates in their pipeline but zero placements — a signal to schedule a check-in.",
      "The Revenue by Client bar chart at the bottom shows placement fees broken down by client company for the period. Use this to identify your highest-value client relationships.",
      "All data in this tab respects the period filter at the top of the Analytics page (this month, last month, this quarter, etc.).",
    ],
  },
  {
    id: "an4",
    category: "analytics",
    title: "Analytics: Email Sync tab",
    summary: "Monitor team email connection health, sync volume, match precision, and sync freshness.",
    readMins: 2,
    content: [
      "Go to Analytics → Email Sync tab. This tab is only meaningful once team members have connected their Gmail or Outlook accounts.",
      "The KPI strip shows: Gmail connections, Outlook connections, total messages synced to date, match precision rate (% of synced emails successfully linked to a candidate), activation rate (% of team with an active connection), and sync freshness (median lag between an email being sent/received and it appearing in Ikhaya).",
      "The 14-day history chart shows daily message sync volume and error counts. A spike in errors on a given day may indicate a webhook outage or token expiry.",
      "If the error count is elevated, go to Settings → Integrations → Email Admin Dashboard to identify which users have broken connections and force-reconnect them.",
      "Match precision rate below 80% is a signal that many of your synced emails can't be matched to candidates — this usually means candidate profiles are missing email addresses.",
    ],
    tips: [
      "This tab pulls live data from the metrics_email_sync table. If it shows no data, the daily metrics cron has not yet run — ask your admin to trigger it manually.",
    ],
  },

  // ── Dashboard ──
  {
    id: "db1",
    category: "getting-started",
    title: "Reading your daily dashboard",
    summary: "Understand the KPIs, activity feed, SLA alerts, and open job list on your home screen.",
    readMins: 3,
    content: [
      "The Dashboard is your home screen — navigate to it with G+D or click the Ikhaya logo. It refreshes in real time from Supabase.",
      "The KPI strip at the top shows four metrics for your team: total active candidates, open jobs, interviews scheduled this week, and placements this month.",
      "The Open Jobs panel lists all active searches sorted by priority. Each row shows the job title, client, assigned recruiter, and a mini pipeline bar showing candidates by stage.",
      "The Recent Activity feed shows all team actions in reverse chronological order: notes added, stage changes, submissions, client feedback, and placements. Hover any item to see the full detail.",
      "SLA Breach alerts appear as amber or red banners when a candidate has been sitting in a stage past its target days (e.g. 'Submitted' with no client feedback after 7 days). Click the alert to go directly to that candidate.",
    ],
    tips: [
      "SLA targets per stage are configured in Settings → Pipeline Stages. Set realistic targets and the dashboard will surface anything slipping.",
    ],
  },

  // ── Interviews ──
  {
    id: "iv1",
    category: "interviews",
    title: "Scheduling interviews and tracking them",
    summary: "Log interviews, set formats and times, and track outcomes from one central view.",
    readMins: 4,
    videoUrl: "https://docs.ikhaya.io/tutorials/interviews",
    content: [
      "Open the Schedule Interview modal from a candidate's pipeline card (⋯ menu → Schedule Interview) or from the Interviews page + button. It's a 3-step wizard.",
      "Step 1 — Details: choose the format (Video, Phone, On-site, Panel), date, start time, and end time. Quick duration buttons (30 min, 45 min, 1 hr, 90 min) auto-fill the end time. Add a meeting link or location and any prep notes.",
      "Step 2 — Interviewers: add the people who will be in the room. Internal team members can be selected from your roster. External interviewers (client-side) can be added by name and email.",
      "Step 3 — Confirm: review the summary, then choose whether to notify the candidate and/or notify the client contact by email. Both toggles are on by default.",
      "After confirming, the interview appears in the Interviews page and in the candidate's activity timeline. Today's interviews are highlighted at the top of the Interviews page with a live badge.",
      "After the interview, update the outcome from the Interviews page or the candidate's card: Completed, Cancelled, or No-show. Each outcome is logged in the activity timeline.",
    ],
    tips: [
      "Adding client-side interviewers in Step 2 means their names appear on the interview record — useful for keeping track of who actually met the candidate.",
    ],
  },
  {
    id: "iv2",
    category: "interviews",
    title: "Interview formats and what each means",
    summary: "Video, phone, on-site, and panel — when to use each and how they're tracked.",
    readMins: 2,
    content: [
      "Video call: a remote meeting via Zoom, Teams, or Google Meet. Best for first and second rounds. Ikhaya stores the format but doesn't integrate with video platforms directly — add the meeting link in the interview notes.",
      "Phone screen: a short call, typically 20–30 minutes. Often used as a pre-screen before a full interview. Appears with a phone icon in the Interviews list.",
      "On-site: an in-person interview at the client's office. Candidates should receive full location and logistics details before the interview — add these in the notes field.",
      "Panel: multiple interviewers at once. Useful for senior hires. The panel format flag helps recruiters know to brief candidates differently than a 1:1 interview.",
      "All four formats appear in the candidate's activity timeline when logged. The format is visible to the candidate's assigned recruiter and the agency admin.",
    ],
  },

  // ── Placements ──
  {
    id: "pl1",
    category: "placements",
    title: "The Placements page — tracking confirmed revenue",
    summary: "See all placements, their fee amounts, invoice status, and total collected revenue.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/placements",
    content: [
      "The Placements page (G+R) shows every confirmed placement made by your agency. Each row is a placed candidate with their job, client, fee, and invoice status.",
      "At the top, a revenue chart shows monthly fees invoiced vs. collected over the trailing 6 months. This is your real revenue picture, separate from the weighted pipeline in Analytics.",
      "Invoice status per placement: Pending (fee not yet invoiced), Invoiced (invoice sent), Partial (some amount collected), Paid (fully collected). Update status from the ⋯ menu on each row.",
      "The KPI strip shows total placements, total fees invoiced, total fees collected, and outstanding balance — all filterable by date range.",
      "A placement record is created when you move a candidate to the 'Placed' stage in the job pipeline and confirm the salary and fee.",
    ],
    tips: [
      "The Placements page is the source of truth for billing. Use it to reconcile with your accounting system at month-end.",
    ],
  },
  {
    id: "pl2",
    category: "placements",
    title: "Logging payments and managing invoice status",
    summary: "Record payment receipts, track partial payments, and update invoice status as money comes in.",
    readMins: 2,
    content: [
      "On the Placements page, find the placement you've received payment for. Click the ⋯ menu and select Log Payment.",
      "In the payment modal, enter the amount received and the date. The outstanding balance updates automatically.",
      "If the payment covers the full fee, the invoice status changes to Paid. If partial, it moves to Partial with the remaining amount shown.",
      "You can log multiple partial payments against the same placement — each is recorded with its date and amount.",
      "To manually override invoice status (e.g. to mark as Invoiced before any payment), use the status dropdown in the ⋯ menu.",
    ],
  },

  // ── Sourcing ──
  {
    id: "src1",
    category: "sourcing",
    title: "Using Sourcing to find passive candidates",
    summary: "Search your database and external sources with advanced filters and AI match scores.",
    readMins: 4,
    videoUrl: "https://docs.ikhaya.io/tutorials/sourcing",
    content: [
      "Go to Sourcing (G+U or sidebar). This is a dedicated search interface for finding candidates — both from your existing database and external signals.",
      "Type a role, skill, or keyword in the main search bar. Results are ranked by match score (0–100), which considers title relevance, skills overlap, experience level, and availability.",
      "Use the filter panel on the left to narrow by: skills (add multiple), location, years of experience, salary expectations, availability (immediately, 30 days, 60 days, passive), and current company.",
      "Switch between Grid view (cards with match score badges) and List view (denser table format) using the toggle in the top right.",
      "Star candidates you want to shortlist. Starred candidates are saved across sessions and can be bulk-added to a job pipeline from the Starred view.",
    ],
    tips: [
      "The match score is most useful for prioritisation, not filtering. Review candidates in the 70–100 range first, but don't ignore 50–69 — they may have unlisted skills.",
      "Availability filters are self-reported. Use them as a guide, not a hard constraint.",
    ],
  },
  {
    id: "src2",
    category: "sourcing",
    title: "Saving Sourcing searches for repeat use",
    summary: "Save your filter combinations so you can re-run the same search for future roles.",
    readMins: 2,
    content: [
      "After building a filter combination in the Sourcing page, click Save Search in the top bar. Give the search a descriptive name (e.g. 'Senior Go engineers, NYC, immediately available').",
      "Saved searches appear in the Saved Searches panel in the left sidebar. Click any saved search to instantly apply all its filters.",
      "Each saved search shows the number of results it returned when last run, and the date it was last used.",
      "To update a saved search, apply the new filters you want and save again with the same name — it will overwrite the previous version.",
      "Delete a saved search from the ⋯ menu next to its name in the saved searches panel.",
    ],
  },

  // ── Reports ──
  {
    id: "rep1",
    category: "reports",
    title: "Generating and sharing reports",
    summary: "Build and send four types of reports — placement summaries, recruiter performance, client activity, and pipeline snapshots.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/reports",
    content: [
      "Go to Reports (G+T or sidebar). You'll see four report templates to choose from.",
      "Placement Report: lists all placements with fee breakdown, time-to-fill, and recruiter attribution. Marked 'Client-facing' — safe to share directly with clients.",
      "Recruiter Performance: submissions, interviews, placements and conversion rates per recruiter. For internal use.",
      "Client Activity: engagement summary per client — submissions received, feedback rate, interviews, and placements. Good for QBRs.",
      "Pipeline Snapshot: current state of all active searches — candidates by stage, staleness flags, and time-in-stage. For internal pipeline reviews.",
      "Select a template, set the date range and filters, then click Preview to see the report. Use Download to export as CSV, or Send to email it directly to a recipient.",
    ],
    tips: [
      "The Placement Report is designed to be client-ready — it doesn't include internal notes or recruiter attribution details that clients shouldn't see.",
      "Schedule regular sends (e.g. weekly Pipeline Snapshot to your team lead) by using Send with a recurring recipient list.",
    ],
  },

  // ── AI Copilot ──
  {
    id: "ai1",
    category: "ai",
    title: "Using the AI Copilot on a candidate profile",
    summary: "Generate job matches, outreach emails, interview prep questions, and profile summaries with one click.",
    readMins: 3,
    videoUrl: "https://docs.ikhaya.io/tutorials/ai-copilot",
    content: [
      "Open any candidate profile and click the Sparkles (✨) button in the top-right action bar. The AI Copilot panel slides in from the right.",
      "The Match tab scores the candidate against all active jobs in your pipeline. Each match shows a score (0–100), which skills are matched, which are missing, and a plain-English fit reason.",
      "The Outreach tab generates a personalized first-touch email to send to the candidate. It references their current role and company. Edit before sending — AI output should always be reviewed.",
      "The Interview tab generates a set of role-relevant interview questions based on the candidate's background. Use these as a starting point for briefing your client's interviewers.",
      "The Summary tab produces a concise professional bio of the candidate suitable for pasting into a submission note or client email.",
    ],
    tips: [
      "AI Copilot output is generated locally using the candidate's profile data already in the system — no external data is used.",
      "Always review and edit AI-generated outreach before sending. Treat it as a first draft, not a final message.",
    ],
  },

  // ── Settings (additional) ──
  {
    id: "st3",
    category: "settings",
    title: "Custom fields — extending candidate and job records",
    summary: "Add your own fields to candidate profiles and jobs to capture data unique to your agency.",
    readMins: 3,
    content: [
      "Go to Settings → Custom Fields. You can define custom fields for two entity types: Candidates and Jobs.",
      "Click Add Field and choose a name, field type, and which entity it applies to. Field types include: text, email, URL, textarea, number, boolean (yes/no), dropdown (single select), and multi-select.",
      "For dropdown and multi-select fields, add the options you want users to be able to choose from.",
      "Once created, custom fields appear in the Custom Fields panel on every candidate profile or job detail page. Team members can fill them in just like built-in fields.",
      "Custom fields can be used in the Sourcing filters and Reports once they contain data. They're also exported in CSV downloads.",
    ],
    tips: [
      "Use custom fields for agency-specific data like 'Security Clearance Level', 'Right to Work Status', 'NDA Signed', or 'Preferred Contract Type'.",
      "Custom field definitions are org-wide — all team members see the same fields on every record.",
    ],
  },
  {
    id: "st4",
    category: "settings",
    title: "Tag taxonomy — organising records with tags",
    summary: "Create a shared tag library so your team applies consistent labels to candidates and jobs.",
    readMins: 2,
    content: [
      "Go to Settings → Tag Taxonomy. This is the master list of tags available across your organisation.",
      "Click Add Tag. Give it a name and optionally assign a colour. The tag is immediately available for use on candidates and jobs.",
      "Tags are applied from the candidate or job detail page. Click + Tag and search your taxonomy.",
      "In the Candidates and Jobs lists, filter by tags to create focused views (e.g. all candidates tagged 'Fintech' or 'Available Q3').",
      "Delete a tag from Settings → Tag Taxonomy. Deleting a tag removes it from all records it was applied to — this is not reversible.",
    ],
    tips: [
      "Agree on a tag vocabulary with your team before creating lots of tags — inconsistent naming (e.g. 'Fin Tech' vs 'Fintech') makes filtering unreliable.",
    ],
  },
  {
    id: "st5",
    category: "settings",
    title: "Audit Trail — tracking all admin actions",
    summary: "See a log of every important action in your Ikhaya workspace, who did it, and when.",
    readMins: 2,
    content: [
      "Go to Settings → Audit Trail (admin-only). This page shows a searchable, filterable log of all significant actions taken in your workspace.",
      "Each entry shows: the action taken, the team member who did it, the record it affected (candidate, job, client), and the exact timestamp.",
      "Use the search bar to find actions by user or record name. Use the filter chip to narrow by action type (e.g. 'stage_change', 'deletion', 'settings_change').",
      "The audit trail is append-only — entries cannot be edited or deleted. It is the authoritative record of what happened in your workspace.",
      "Download the audit log as CSV using the Export button at the top right. Useful for compliance reporting.",
    ],
  },
  {
    id: "st6",
    category: "settings",
    title: "Data & Privacy settings",
    summary: "Manage data retention, export candidate data, and fulfil right-to-erasure requests.",
    readMins: 2,
    content: [
      "Go to Settings → Data & Privacy. This section handles GDPR and CCPA compliance workflows for your agency.",
      "To export a candidate's data (Data Subject Access Request), search for the candidate and click Export Data. A JSON file containing all stored data is downloaded.",
      "To delete a candidate and all their data (Right to Erasure), open the candidate profile, go to the ⋯ menu, and select Delete Candidate. This permanently removes the profile, activity, emails, and all linked records.",
      "Email sync data is automatically purged when a recruiter disconnects their email provider. No separate action is needed.",
      "Ikhaya stores all data in the EU-West region by default. Contact support if you need data residency in a different region.",
    ],
    tips: [
      "Deletion is permanent and cannot be undone. Export the candidate's data first if you may need a record for legal or compliance purposes.",
    ],
  },

  // ── Getting Started — Onboarding Wizard ──
  {
    id: "gs4",
    category: "getting-started",
    title: "First-time onboarding wizard",
    summary: "Run through the 4-step onboarding to set up your agency, invite teammates, and configure email basics.",
    readMins: 3,
    content: [
      "When your agency account is first created, Ikhaya routes you to /onboarding — a 4-step setup wizard. Each step saves to the database before advancing, so you can stop and pick up where you left off.",
      "Step 1 — Agency Profile: enter your agency name (required) and website (optional). The agency name is what your team and clients will see across the product.",
      "Step 2 — Invite Team: add as many teammate rows as you need with email addresses and roles (Admin, Sr. Recruiter, Recruiter, or Viewer). You can skip this step and invite people later from Settings → Team & Access.",
      "Step 3 — Email Setup: enter the physical mailing address required for CAN-SPAM compliance on outbound emails. This appears in the footer of automated and sequenced emails sent from your account.",
      "Step 4 — You're Ready: confirmation screen. From here you'll be dropped onto the dashboard. Your next sensible move is to import a candidate CSV or create your first job search.",
    ],
    tips: [
      "If you close the browser mid-wizard, return to /onboarding and you'll resume at the next incomplete step — no progress is lost.",
    ],
    relatedIds: ["gs1", "gs2"],
  },

  // ── Candidates — Compare & Duplicates ──
  {
    id: "c10",
    category: "candidates",
    title: "Comparing candidates side-by-side",
    summary: "Use the internal Compare view to evaluate up to 4 candidates against the same job, with rankings saved as notes.",
    readMins: 3,
    content: [
      "Navigate to /candidates/compare from the Candidates page header (Compare button) or by selecting candidates and clicking Compare in the bulk-actions bar. This is an internal-only view — distinct from the client portal compare at /portal/[slug]/compare.",
      "Each selected candidate gets its own column. The page shows core fields side-by-side: current title, company, location, status, source, desired salary, remote preference, LinkedIn, and summary.",
      "Fields where candidates' values differ are highlighted automatically — that's what to focus on when deciding between similar profiles.",
      "Each column has a ranking bar with four options: Top pick (trophy), Shortlist (thumbs up), Consider (star), and Pass. Selecting a ranking saves it as a 'ranking' note on that candidate's profile so the decision is captured in their activity timeline.",
      "Click a candidate's name in the column header to open their full profile in a new tab without losing your current comparison.",
    ],
    tips: [
      "Use Compare alongside the Match tab on a job — Match tells you who fits the role; Compare lets you decide between the top fits.",
    ],
  },
  {
    id: "c11",
    category: "candidates",
    title: "Resolving duplicate candidates",
    summary: "Find and merge duplicate candidate records detected by email, phone, or name.",
    readMins: 3,
    content: [
      "Go to /candidates/duplicates (linked from the Candidates page header). Ikhaya scans your database for potential duplicates and groups them by match reason: Same email, Same phone, or Same name.",
      "Each group shows a confidence badge — high (red, e.g. exact email match) or medium (amber, e.g. matching name only). High-confidence matches are almost always genuine duplicates; medium matches need human judgement.",
      "Click Merge on a group to open the merge dialog. Choose which record is the 'survivor' (the one that stays) — usually the more complete profile. The other record's data is folded into the survivor: activity, emails, pipeline entries, and notes are all preserved.",
      "Click Dismiss to remove a group from the list without merging — useful when two real people happen to share a phone number or have the same common name.",
      "After every merge or dismissal, the list refreshes. Once you've worked through every group, you'll see a 'Your candidate database is clean!' confirmation screen.",
    ],
    tips: [
      "Merging is permanent — review both records carefully before clicking Merge. Activity is folded into the survivor; the duplicate row is removed.",
    ],
  },

  // ── Reports — Custom Builder ──
  {
    id: "rep2",
    category: "reports",
    title: "Building custom reports",
    summary: "Use the drag-and-drop report builder to define your own dimensions and metrics without writing SQL.",
    readMins: 3,
    content: [
      "Go to Reports → Custom (or /reports/custom). The page is a visual canvas — pick an entity, drag in dimensions and metrics, and run.",
      "Choose an entity from the picker at the top: Candidates, Jobs, Applications, Placements, or Activities. The dimension and metric options change based on the entity you select.",
      "Drag dimensions onto the rows shelf — these are the categories your data is grouped by (e.g. Status, Month placed, Activity type). Drag metrics onto the values shelf — these are what you're measuring (Count, Total fees, Average fee).",
      "Click Run to execute the report. Results render as a table below. Click Save to store this report definition under a name (saved reports appear in your Saved Reports list and can be re-run anytime).",
      "Click Download to export the current results as CSV — useful for pasting into a slide deck or sending to your accountant.",
    ],
    tips: [
      "Custom reports run client-side over up to 1000 rows from the chosen entity. For larger datasets, save the report and ask an admin to run a server-side export.",
      "The Custom Report Builder is part of the Growth-tier Analytics feature — if you don't see it, check your plan in Settings → Billing.",
    ],
    relatedIds: ["rep1"],
  },

  // ── Analytics — additional tabs ──
  {
    id: "an5",
    category: "analytics",
    title: "Analytics: Executive Dashboard",
    summary: "Firm-wide KPIs for agency principals — revenue, placements, client risk distribution, and recruiter leaderboard.",
    readMins: 3,
    content: [
      "Go to /analytics/executive. The Executive Dashboard is a single-screen health check across the whole agency — designed for principals and senior leaders, not day-to-day recruiters.",
      "The KPI strip at the top shows: YTD revenue, YTD placements, active jobs, active clients, and average fee. Each card includes a 90-day delta vs. the prior 90 days so you can see if revenue is accelerating or slipping.",
      "The Client health panel groups every active client by risk level (healthy, at-risk, critical) with horizontal bar segments and counts. This is your at-a-glance view of which client relationships need attention.",
      "The Recruiter leaderboard ranks each team member by placement count for the period. Use it to spot consistent top performers and recruiters who may need coaching.",
      "The Pipeline overview at the bottom shows total candidates by stage across all active jobs — a single-pane view of your entire team's work in flight.",
    ],
    tips: [
      "The Executive Dashboard is part of the Pro-tier executive_dashboard feature. If you don't see it in the Analytics nav, your plan doesn't include it yet.",
    ],
    relatedIds: ["an1", "an2"],
  },
  {
    id: "an6",
    category: "analytics",
    title: "Analytics: Activity Metrics",
    summary: "Leading-indicator activity per recruiter — calls, meetings, emails, and submissions logged in a chosen window.",
    readMins: 2,
    content: [
      "Go to /analytics/activity. This dashboard shows recruiter activity that leads placements — calls logged, meetings held, emails sent, and submissions made.",
      "Pick a window at the top: 7 days, 30 days, or 90 days. The data refreshes for the selected period.",
      "Each row is a recruiter with their counts in each activity type plus a Total column. Rows are sorted by total activity, descending — the most active recruiter appears at the top.",
      "Use the bar visualisation in the Total column to compare recruiters at a glance. The longest bar is the highest-activity recruiter; short bars suggest under-activity worth a check-in.",
      "Activity is logged automatically when actions happen in Ikhaya — adding a note, scheduling an interview, sending an email through the platform, or submitting a candidate. Manual call logs (using the Activity ⋯ menu on a candidate profile) also count toward the total.",
    ],
    tips: [
      "Activity counts are leading indicators. Low activity in week 1 of the month often predicts a thin placement count by week 4 — use this to coach early.",
    ],
  },
  {
    id: "an7",
    category: "analytics",
    title: "Analytics: DEI & Adverse Impact",
    summary: "Selection rate by protected class with automatic four-fifths rule violation flags.",
    readMins: 3,
    content: [
      "Go to /analytics/dei. This admin-only dashboard analyses placement rates across protected classes (gender and race/ethnicity) using the four-fifths rule from US EEOC guidelines.",
      "The page shows two tables: one by gender, one by race/ethnicity. Each row shows the group, applicant count, placement count, selection rate (placements ÷ applicants), and the 4/5 ratio (this group's rate ÷ the highest group's rate).",
      "A 4/5 ratio below 0.80 means this group is selected at less than 80% of the rate of the highest-selected group — the threshold the EEOC uses to flag potential adverse impact. Flagged rows are highlighted in red and counted in the table header.",
      "EEO data is collected only when candidates self-identify on application forms. Candidates who decline to self-identify are excluded from the analysis. Groups with fewer than 5 applicants are not flagged (sample size too small).",
      "Use this dashboard alongside, not instead of, advice from your employment counsel. The four-fifths rule is a screening signal — it does not by itself prove discrimination.",
    ],
    tips: [
      "If the DEI dashboard shows 'No EEO data collected yet', enable the candidate-facing self-identification fields in Settings → Compliance.",
    ],
  },
  {
    id: "an8",
    category: "analytics",
    title: "Analytics: Search Analytics",
    summary: "Most-searched skills and titles, thin-supply alerts, and per-recruiter search-to-pipeline conversion.",
    readMins: 3,
    content: [
      "Go to /analytics/search (admin-only). This dashboard analyses how your team uses the Sourcing search — what they look for, what they click, and what makes it into the pipeline.",
      "Pick a window at the top: 30 days or 90 days. Data refreshes for the selected period.",
      "The Top Searched Skills & Titles table lists the most-queried terms across your team. The click-through rate (CTR) shows how often searches for that term resulted in a candidate click.",
      "The Thin Supply Alerts panel flags terms that are searched frequently but rarely click through — these are signs that your candidate database is short on supply for those skills. Sourcing externally for those terms is likely your highest-leverage move.",
      "The Recruiter Conversion Funnel shows each recruiter's progression from search → click → view → pipeline_add for the period. Recruiters with high searches but low pipeline_add counts may need coaching on how to convert searches into shortlists.",
    ],
    tips: [
      "Thin-supply terms are an opportunity, not a problem — they tell you where to focus outbound sourcing or LinkedIn campaigns.",
    ],
  },

  // ── Settings — Fee Models & Payouts ──
  {
    id: "st7",
    category: "settings",
    title: "Fee Model Library",
    summary: "Define reusable fee structures (percentage, flat, retained, container, hybrid) and reuse them across placements.",
    readMins: 3,
    content: [
      "Go to Settings → Fee Models. The Fee Model Library is your reusable catalogue of fee structures — instead of typing percentages and payment terms into every placement, you create them once here.",
      "Click Add Fee Model. Pick a fee type: Percentage (% of base salary, total comp, or package), Flat Fee (fixed amount), Retained (engagement retainer), Container (installment-based), or Hybrid (a mix — described in notes).",
      "For each model, set the basis (first year salary, total comp, base salary, or package value), payment terms (e.g. 'Net 30 from start date'), guarantee period in days, split-invoicing toggle, and off-limits months (the period after a placement during which you won't approach that candidate or client).",
      "Mark one model as Default — it'll be pre-selected when you create new jobs and offers. Default models are highlighted with a brand-coloured border and a DEFAULT pill.",
      "Edit or delete any model from its card. Edits apply only to future use — existing placements keep the fee structure they were created with.",
    ],
    tips: [
      "Set up your Standard Contingency, Retained Search, and Container fee models once during onboarding — every new job picks them up automatically.",
    ],
  },
  {
    id: "st8",
    category: "settings",
    title: "Recruiter Payouts (commission tracking)",
    summary: "Approve, mark paid, hold, and export commission splits for finance.",
    readMins: 4,
    content: [
      "Go to Settings → Payouts (admin-only). This page is the approval gate between confirmed placements and the finance team — every commission split flows through here.",
      "Pick a date window at the top (defaults to the prior calendar month). Every placement that landed in the window appears with its splits broken out per recruiter.",
      "Use the status filter to focus on Pending (not yet approved), Approved (signed off, ready to pay), Paid (already paid out), or Held (paused while you investigate).",
      "Select rows by clicking the checkbox, then use the action bar: Approve flips Pending → Approved; Mark Paid flips Approved → Paid; Hold pauses a row; Unhold resumes it. Each action prompts a confirmation.",
      "Click Export CSV to download a file for finance. By default the export contains only Approved + Paid rows — anything Pending is flagged in a banner so nothing falls through the cracks.",
      "Each row shows the placement, candidate, client, job, recruiter, split percentage, split amount, and any notes. Click a placement ID to jump to the placement record.",
    ],
    tips: [
      "Recruiter Payouts is a Pro-tier feature (commission_split_tracking). The page surfaces an upgrade card if your plan doesn't include it.",
      "Run Payouts at the start of every month for the prior month's placements — that cadence keeps your splits in sync with your accounting close.",
    ],
    relatedIds: ["pl1"],
  },

  // ── Settings — Sending & Suppression ──
  {
    id: "st9",
    category: "settings",
    title: "Setting up a custom sending domain",
    summary: "Verify your domain with SPF, DKIM, and DMARC records so emails send from yourdomain.com instead of Ikhaya's default.",
    readMins: 4,
    content: [
      "Go to Settings → Sending Domains. Click Add Domain and enter the domain you want to send from (e.g. acmesearch.com). Ikhaya generates the three DNS records you need: SPF, DKIM, and DMARC.",
      "Copy each record into your DNS provider (Cloudflare, Route 53, Namecheap, etc.). The DKIM record is the longest — make sure to copy the entire value, not just the start.",
      "Wait 5–30 minutes for DNS propagation. Then return to the domain card in Ikhaya and click Verify. Ikhaya checks all three records live and reports which ones are present.",
      "Once all three pass, the domain is marked Verified with a green badge. From this point on, sequenced and one-off emails sent from your account use this domain in the From header.",
      "If verification fails, expand the domain card to see exactly which records are missing. The most common cause is DNS not yet propagated — wait another 15 minutes and try again.",
    ],
    tips: [
      "Use a subdomain (e.g. mail.acmesearch.com) rather than your bare domain for sending. This isolates email deliverability from anything else hosted at the apex.",
    ],
  },
  {
    id: "st10",
    category: "settings",
    title: "Managing the suppression list",
    summary: "View unsubscribes, hard bounces, and spam complaints — and prevent emailing addresses that should never be contacted.",
    readMins: 2,
    content: [
      "Go to Settings → Suppression. This is the master list of addresses that Ikhaya will never email, no matter what — protecting your sender reputation and keeping you CAN-SPAM and GDPR compliant.",
      "Each entry shows the email, the reason it was suppressed (Unsubscribe, One-click unsubscribe, Hard bounce, Spam complaint, or Manual), the source, an optional note, and when it was added.",
      "Add an entry manually using the Add to Suppression form — use this to pre-emptively block someone who's asked not to be contacted. Enter the email and an optional internal note.",
      "Remove an entry only if you have explicit re-consent from the person. Hard bounces and complaints should generally not be removed — they signal a real deliverability problem.",
      "The Bounce Events panel below the suppression list shows the last 100 bounce events with the SMTP status code and diagnostic message. Use it to triage delivery issues — repeated soft bounces from a domain may indicate a temporary outage rather than a bad address.",
    ],
    tips: [
      "Never email someone you've removed from suppression without explicit re-opt-in — re-engaging suppressed addresses tanks your sender reputation.",
    ],
  },

  // ── Settings — Webhooks, API Keys, Integrations ──
  {
    id: "st11",
    category: "settings",
    title: "Setting up outbound webhooks",
    summary: "Register HTTPS endpoints to receive signed event payloads from Ikhaya — for Zapier, Make, or custom integrations.",
    readMins: 3,
    content: [
      "Go to Settings → Webhooks. Click Add Webhook and enter the HTTPS URL that should receive event payloads. Optionally choose which event types this endpoint subscribes to.",
      "Supported events include: candidate.created, candidate.updated, candidate.stage_changed, placement.created, job.created, job.filled, application.created, and a few more — check the dropdown for the full list.",
      "Every webhook delivery is signed with HMAC-SHA256. The signing secret is shown once when the webhook is created — copy it immediately into your integration. Each request includes an X-Ikhaya-Signature header you must verify before trusting the payload.",
      "Failed deliveries (non-2xx responses or timeouts) are retried with exponential backoff for up to 24 hours. The Recent Deliveries panel on each webhook card shows the last 50 attempts with status, response code, and timing.",
      "Disable a webhook from its card if you need to pause delivery without deleting the configuration. Re-enable it later and queued events will resume.",
    ],
    tips: [
      "For Zapier or Make, point the webhook at the trigger URL they provide. Both platforms verify the signature automatically — you don't need custom verification code.",
    ],
    relatedIds: ["st12"],
  },
  {
    id: "st12",
    category: "settings",
    title: "Creating scoped API keys",
    summary: "Issue API keys for service accounts and external scripts, with explicit scopes and revocation.",
    readMins: 3,
    content: [
      "Go to Settings → API Keys (owners and admins only). The page lists every active key with its name, prefix (the visible portion), scopes, last-used time, and expiry.",
      "Click New Key to create one. You'll be prompted to verify your email via a one-time code — this is required for any sensitive admin action.",
      "Give the key a name (use the consuming system's name, e.g. 'Looker connector'), pick the scopes it needs (read-only on candidates, write on placements, etc.), and optionally set an expiry date. Narrow scopes are always safer than full access.",
      "After creation, the full key is shown ONCE in a confirmation modal. Copy it immediately into your destination — Ikhaya does not store the full value and you cannot retrieve it later.",
      "Revoke a key from the ⋯ menu on its row. Revocation is immediate — any in-flight request signed with that key fails with a 401.",
    ],
    tips: [
      "Rotate keys at least annually. Set an expiry on every new key as a forcing function for rotation.",
      "Never paste API keys into chat, email, or repository code. Use your platform's secret manager (AWS Secrets Manager, GitHub Actions secrets, Vercel env vars).",
    ],
  },
  {
    id: "st13",
    category: "settings",
    title: "Browsing the Integration Marketplace",
    summary: "Enable connectors for meeting intelligence, e-signature, job distribution, reference checks, ATS sync, enrichment, and automation.",
    readMins: 2,
    content: [
      "Go to Settings → Integrations → Marketplace. Connectors are grouped by category: Meeting Intelligence (Gong, Otter, Fireflies), E-Signature (DocuSign, Adobe Sign), Job Distribution (Broadbean, Idibu), Reference Checks (Crosschq), Client ATS (Greenhouse, Lever), Enrichment (ContactOut, Apollo), and Automation (Zapier, Make).",
      "Each card shows the connector's name, category, a one-line description, and a status badge: Available (ready to enable), Beta (works but rough edges), or Coming Soon (planned, not yet shipped).",
      "Click Enable on any Available or Beta connector. You'll be redirected through that vendor's OAuth flow. Once authorised, the connector appears in your Settings → Integrations list with controls to disable, reconnect, or configure.",
      "Coming Soon connectors show a 'Get Notified' button instead of Enable — clicking it adds you to the waitlist for that integration.",
      "All enabled connectors run within Ikhaya's audit trail — every external API call is logged and visible in Settings → Audit Trail.",
    ],
    tips: [
      "Start with Otter or Fireflies for interview transcripts, Apollo for outreach enrichment, and Zapier for one-off automations. Add specialist tools (Gong, Crosschq) when you have a clear workflow that needs them.",
    ],
  },

  // ── Settings — AI ──
  {
    id: "st14",
    category: "settings",
    title: "Configuring AI models (BYO API key)",
    summary: "Select which Claude model Ikhaya uses and supply your own Anthropic API key for full control over usage and cost.",
    readMins: 3,
    content: [
      "Go to Settings → AI Models (admin-only). Pick which Claude model powers all AI features in your workspace — the picker shows currently-supported model IDs with a short description of each.",
      "Below the model picker, paste your own Anthropic API key. Storing your own key means your usage shows up on your Anthropic bill, you control rate limits, and you can audit usage in your Anthropic console. The key is stored encrypted and is never shown after save — only an indicator that a key is present.",
      "Optionally paste an OpenAI API key. OpenAI is used only for embedding generation (used by the Match tab and Sourcing similarity scores). If you don't supply one, embedding features fall back to Ikhaya's shared embedding service.",
      "Click Verify Key to ping the configured key with a small live request. A green check confirms the key works; a red error explains what's wrong (invalid key, rate limited, etc.).",
      "Use Reset to remove a stored key — Ikhaya falls back to the shared default key. Useful if you're moving keys between Anthropic organisations.",
    ],
    tips: [
      "BYO key gives you a per-feature usage view in your Anthropic console — invaluable for cost attribution if you're rolling AI features out across multiple teams.",
    ],
  },
  {
    id: "st15",
    category: "settings",
    title: "AI transparency and decision log",
    summary: "Show or hide AI decisions on the candidate portal, and audit every AI-assisted decision in the past 30 days.",
    readMins: 3,
    content: [
      "Go to Settings → AI Transparency (admin-only). This page exists to satisfy the EU AI Act requirement that candidates be informed when AI is involved in decisions about them — it's also useful for any agency that wants a defensible AI audit trail.",
      "The Master Toggle controls whether AI decisions are visible on the candidate-facing portal. When on, candidates see badges like 'This recommendation was AI-assisted' next to relevant items. Internal logging always remains on regardless of this setting.",
      "The 30-day Activity Summary groups decisions by type — match scoring, outreach generation, summary generation, interview question generation. Use this for weekly/monthly compliance reviews.",
      "The Decision Table below the summary shows every AI decision with: type, subject (which candidate/job), provider, model, model card URL, rationale, who triggered it, and whether it was visible to the candidate. Filter by type and date range using the controls at the top.",
      "Each row links to the model card for the model used — useful when you need to show due diligence on the model's training and evaluation.",
    ],
    tips: [
      "Keep candidate-portal transparency on if you operate in the EU. The AI Act requires it for high-risk decisions; recruiting decisions are explicitly listed as high-risk.",
    ],
    relatedIds: ["st14", "ai1"],
  },

  // ── Settings — Compliance ──
  {
    id: "st16",
    category: "settings",
    title: "Compliance & Data Privacy admin",
    summary: "Track DSAR requests, log incidents, manage retention policies, and maintain Article 30 records in one place.",
    readMins: 4,
    content: [
      "Go to Settings → Compliance. The page has five tabs: Overview, DSAR Queue, Incidents, Retention, and Article 30.",
      "Overview shows compliance KPIs: open DSARs, days to next retention purge, open incidents, and your last Article 30 review date. Anything overdue is highlighted in red.",
      "DSAR Queue lists every Data Subject Access Request (export, deletion, correction) with its status, age, and assigned owner. GDPR requires fulfilment within 30 days — the queue surfaces anything approaching the deadline. Click a request to view its full audit trail and complete the response.",
      "Incidents tracks data incidents (breaches, near-misses, privacy violations) with their severity, status, affected records, and notification timeline. Use this to maintain an incident register that satisfies regulator audits.",
      "Retention shows your retention policy per record type (candidates, emails, etc.). Records past their retention period are automatically scheduled for purge — the next purge run date is shown at the top.",
      "Article 30 links to your Record of Processing Activities. See the dedicated RoPA article for details.",
    ],
    tips: [
      "Schedule a recurring monthly review of the Compliance Overview tab. It takes 5 minutes and prevents 30-day SLA misses on DSARs.",
    ],
    relatedIds: ["st17", "st6"],
  },
  {
    id: "st17",
    category: "settings",
    title: "Record of Processing Activities (Article 30)",
    summary: "Maintain your GDPR Article 30 register — every processing activity, its legal basis, and review status.",
    readMins: 3,
    content: [
      "Go to Settings → Compliance → Article 30 (or /settings/compliance/ropa). GDPR Article 30 requires data controllers to keep a written record of all processing activities. This page is your register.",
      "Each record describes one processing activity: what data is processed, why, the legal basis, who has access, where it's stored, and how long it's retained. Ikhaya seeds the register with default entries for the standard ATS activities (candidate sourcing, candidate communication, placements).",
      "Each record has a Legal Basis selector with the six GDPR options: Consent, Contract, Legal obligation, Vital interests, Public task, or Legitimate interests. Pick the one that actually applies — most recruiting activity is Legitimate interests or Contract.",
      "Records have an annual review obligation. The page banner shows how many records are overdue for review. Click Mark as Reviewed on a record to reset its review timer.",
      "Add new records when you start a new processing activity — for example, when enabling a new connector that processes candidate data, or when introducing a new outreach channel.",
    ],
    tips: [
      "Export the RoPA register periodically (use the Export CSV button) for your data protection officer or legal counsel to review.",
    ],
  },

  // ── Settings — Security & Sessions ──
  {
    id: "st18",
    category: "settings",
    title: "Active sessions and session security",
    summary: "See every device signed into your account and revoke any session you don't recognise.",
    readMins: 2,
    content: [
      "Go to Settings → Security. The Active Sessions panel lists every browser or device currently signed into your account, with a device label, IP address, last-active time, and a Revoke button.",
      "Your current session is marked clearly so you don't accidentally sign yourself out. Other devices appear below, sorted by last-active.",
      "Click Revoke on any session to immediately sign that device out. The next request from that device fails authentication and the user is sent to the login screen.",
      "Use Revoke All Other Sessions if you suspect account compromise or want a clean slate. This action requires email OTP verification — Ikhaya sends a one-time code to your address before proceeding.",
      "Sessions automatically expire after periods of inactivity per your org's session policy. Admins can configure session timeout in Settings → Org → Security policy.",
    ],
    tips: [
      "If you see a session you don't recognise, revoke it immediately, then change your password and review your recent activity in the Audit Trail.",
    ],
  },
  {
    id: "st19",
    category: "settings",
    title: "IP allowlisting and geo restrictions",
    summary: "Restrict access to your workspace by IP range so only your office or VPN can sign in.",
    readMins: 3,
    content: [
      "Go to Settings → Security → IP Allowlist (admin-only). The allowlist controls which IP ranges are permitted to sign in to your Ikhaya workspace.",
      "Click Add Rule. Enter a CIDR range (e.g. 203.0.113.0/24 for a /24 office block) and an optional label. Save. The rule applies immediately to all subsequent sign-ins — existing sessions are not affected.",
      "Toggle a rule off using the power icon to temporarily disable it without deleting. Useful when testing a new range or troubleshooting access issues.",
      "If no rules are defined, the allowlist is inactive — sign-in is permitted from anywhere. Adding even one rule activates the list and blocks anything outside the listed ranges.",
      "Be careful not to lock yourself out: always add your current office or VPN range first, verify you can still sign in, then add narrower restrictions on top. Ikhaya warns you if you're about to add a rule that doesn't include your current IP.",
    ],
    tips: [
      "Use VPN-based allowlisting rather than office IP allowlisting — it covers remote-working employees and means you don't need to update the allowlist every time the office moves.",
    ],
  },

  // ── Settings — Prep Templates ──
  {
    id: "st20",
    category: "settings",
    title: "Stage prep template library",
    summary: "Save reusable prep notes (text or links) to share with candidates at specific pipeline stages.",
    readMins: 2,
    content: [
      "Go to Settings → Prep Templates. The library is a list of reusable content snippets — interview prep guides, company background notes, technical assessment instructions, etc. — that recruiters can apply to any candidate's portal in one click.",
      "Click New Template. Choose a content type: Text (a free-form note that appears inline) or Link (a URL to an external resource — Notion doc, Google Drive folder, etc).",
      "Optionally scope the template to a stage name (e.g. 'Onsite Interview' or 'Final Round'). Stage-scoped templates are suggested first when applying prep to a candidate at that stage. Leave the scope blank to make the template available for any stage.",
      "Set is_global to true if you want the whole agency to be able to use this template. Otherwise it's visible only to you.",
      "From a candidate detail page, click Add Prep on their portal section, pick a template from the list, and apply. The text or link is added to what the candidate sees on their portal.",
    ],
    tips: [
      "Build out a small number of high-quality templates rather than dozens of one-off ones — recruiters use templates that are easy to find and trust.",
    ],
  },

  // ── Business Development ──
  {
    id: "bd1",
    category: "bd",
    title: "Working the Business Development pipeline",
    summary: "Track prospect companies as deals through stages, with weighted pipeline value and overdue-action surfacing.",
    readMins: 4,
    content: [
      "Go to Business Development (top-level nav). The BD pipeline is a kanban board where each card is a prospect — a company you're trying to land as a client — moving through stages like Prospect, Qualified, Proposal, Won, and Lost.",
      "The KPI strip at the top of the page shows: Active Deals, Weighted Pipeline (estimated value × probability summed across all open deals), Won This Month, and Overdue Actions.",
      "Click + New Opportunity to add a prospect. Enter the company name, optional contact details, the stage to start in, estimated deal value, win probability (0–100%), source, priority, next action, and notes.",
      "Drag cards between stages to move deals forward. Won and Lost are terminal stages — moving a card there triggers a celebratory toast (Won) or a debrief prompt (Lost).",
      "Each card shows a coloured priority badge, source tag, age in stage (with an amber/red warning when stagnant), value × probability, the next action and its due date, and inline icons for emailing or LinkedIn-stalking the contact.",
      "Switch between Kanban view (default) and List view using the toggle in the top right. List view is denser and easier for sorting/filtering large pipelines.",
    ],
    tips: [
      "Set a next-action date on every active opportunity. Overdue Actions in the KPI strip is the single best 'what to do today' indicator.",
      "BD is part of the Pro tier (business_development feature). If you don't see it in your nav, your plan doesn't include it yet.",
    ],
  },
  {
    id: "bd2",
    category: "bd",
    title: "Target Account Lists",
    summary: "Build named lists of target companies you're trying to land — your account-based BD strategy in one place.",
    readMins: 3,
    content: [
      "Go to BD → Target Accounts (or /bd/target-accounts). Target Account Lists let you organise prospect companies into named groups — for example 'Tier 1 Fintech NYC' or 'Q3 Aerospace Push'.",
      "Create a new list with the New Target Account List form. Give it a name, an optional description, and pick a colour. The colour is shown next to the list name in the sidebar so you can scan quickly.",
      "Add companies to a list using the Add Companies picker. Search your existing company database, click + on each company you want to add. Adding to a list does not change the company's status — it's a marker for your BD focus.",
      "Companies in lists are tagged with a tier: Tier 1 (highest priority — pursue actively), Tier 2 (medium priority), or Tier 3 (long-tail). Update the tier from the company's row in the list.",
      "Delete a list to remove the list itself; the companies in it remain in your database. Remove an individual company from a list using the X next to its row.",
    ],
    tips: [
      "Use one list per BD initiative or campaign so you can run focused outbound without polluting your master pipeline.",
    ],
    relatedIds: ["bd1"],
  },
  {
    id: "bd3",
    category: "bd",
    title: "Alumni Signals — re-engaging placed candidates",
    summary: "See placed candidates who have recently changed roles or companies — warm leads for backfills and new searches.",
    readMins: 3,
    content: [
      "Go to BD → Alumni Signals (or /bd/alumni). Ikhaya scans nightly for placed candidates whose role or company has changed and surfaces them here as potential re-engagement opportunities.",
      "Each signal shows the type — Role Change, Company Change, Promotion, or Left Company — along with the candidate's previous title, new title or company, and when the signal was detected.",
      "When someone leaves your placed company (Left Company signal), there's often an immediate backfill opportunity at the original client. When someone gets promoted at a new company (Promotion or Role Change), they may be in a position to hire — they're now a potential client contact.",
      "Click View Candidate to open the candidate's profile. Add an action note (e.g. 'reached out about backfill') and click Actioned to remove the signal from the inbox. Actioned signals don't reappear.",
      "An empty inbox means you've worked through every current signal. Signals refresh nightly, so check back regularly.",
    ],
    tips: [
      "Alumni signals are often your warmest leads — these are people who already know your agency. Re-engagement messages convert at a much higher rate than cold outreach.",
    ],
    relatedIds: ["bd1"],
  },
  {
    id: "bd4",
    category: "bd",
    title: "Tracking referrals",
    summary: "Log referrals from candidates, clients, and employees, and track them through pending → contacted → converted.",
    readMins: 3,
    content: [
      "Go to BD → Referrals (or /bd/referrals). The page lists every referral your agency has received with its status: Pending (received, not yet acted on), Contacted (you've reached out), Converted (turned into a placement or signed client), Declined, or Expired.",
      "Click + New Referral to log one. Pick the referral type (Candidate referral or Client referral), who referred them (Candidate, Client, Employee, or Other), the referrer's name, the referred person/company name, an optional reward description, and notes.",
      "Filter referrals by status using the chips at the top. Sort by source type using the cards above the table to see which channels are producing the most converted referrals.",
      "Update a referral's status from its row by clicking the status badge. Move Pending → Contacted when you reach out, then Contacted → Converted when it lands. Declined or Expired close out the loop.",
      "Use the Reward Description field to track promised incentives (e.g. '$500 referral bonus on close') so you don't forget to pay out when the referral converts.",
    ],
    tips: [
      "Log every referral the moment it comes in, even if the lead seems weak. Tracking your referral funnel is the only way to learn which sources reliably produce placements.",
    ],
    relatedIds: ["bd1"],
  },
];

// ─── Workflow Guides ───────────────────────────────────────────────────────────

const WORKFLOWS: WorkflowGuide[] = [
  {
    id: "wf1",
    title: "End-to-end placement workflow",
    summary: "From sourcing your first candidate to confirming a placement — the complete recruiting loop in Ikhaya.",
    icon: ArrowRight,
    duration: "15 min read",
    steps: [
      {
        title: "Source and import candidates",
        detail: "Start in the Candidates page. Import a CSV from LinkedIn Recruiter, or add candidates manually. Each candidate gets a profile with status 'New'.",
        link: { label: "How to import from LinkedIn", href: "/help?article=c1" },
      },
      {
        title: "Create the job search",
        detail: "In Jobs, click New Search. Complete the 4-step wizard: role details, compensation and fee, team assignment, and pipeline stage review.",
        link: { label: "Creating a new search", href: "/help?article=j1" },
      },
      {
        title: "Add candidates to the pipeline",
        detail: "Open the job and go to the Pipeline tab. Use the + button on any stage column to add existing candidates from your database to this search.",
      },
      {
        title: "Screen and advance through stages",
        detail: "Drag candidates forward as you screen them. Add notes and tasks to track your progress. Use the Funnel tab to see drop-off rates across all candidates.",
        link: { label: "Moving candidates through the pipeline", href: "/help?article=p1" },
      },
      {
        title: "Submit to client",
        detail: "Click Submit to Client on a candidate card. Write a cover note, highlight key strengths, and choose the client contact to notify. The client gets a portal link instantly.",
        link: { label: "Submitting a candidate to a client", href: "/help?article=c4" },
      },
      {
        title: "Manage client feedback",
        detail: "Client decisions (Advance/Hold/Pass) sync back automatically. Advance moves the candidate to Interview stage. Check the Client Portal article for the client's full experience.",
        link: { label: "What clients see on the portal", href: "/help?article=por1" },
      },
      {
        title: "Confirm the placement",
        detail: "When an offer is accepted, set the candidate's stage to Placed. Then set the job status to Closed/Filled. Enter the confirmed salary and fee. This records the revenue in Analytics.",
      },
    ],
  },
  {
    id: "wf2",
    title: "Email integration setup",
    summary: "Connect Gmail or Outlook so every candidate email lands in their timeline automatically.",
    icon: Mail,
    duration: "10 min setup",
    steps: [
      {
        title: "Go to Settings → Integrations",
        detail: "Navigate to Settings and open the Integrations section. You'll see cards for Gmail and Outlook/Microsoft 365.",
      },
      {
        title: "Connect your provider",
        detail: "Click Connect Gmail (or Connect Outlook). Complete the OAuth flow in the browser tab that opens. Grant the requested permissions.",
        link: { label: "Connecting Gmail", href: "/help?article=em1" },
      },
      {
        title: "Wait for backfill",
        detail: "Ikhaya scans your existing sent and received emails and matches them to candidates in your database. A backfill status bar shows progress. Typically takes 2–5 minutes.",
      },
      {
        title: "Review the Fuzzy Review inbox",
        detail: "Some emails can't be auto-matched. Go to Outreach → Fuzzy Review Inbox to confirm or reject Ikhaya's best-guess matches.",
        link: { label: "Reviewing unmatched emails", href: "/help?article=em4" },
      },
      {
        title: "Check a candidate timeline",
        detail: "Open any candidate profile and scroll to the Activity Timeline. Matched emails appear with a mail icon, grouped by thread.",
      },
      {
        title: "Enable team-wide (admins only)",
        detail: "Each team member connects their own email. Admins can monitor connections and force-disconnect from the Email Admin Dashboard in Settings → Integrations.",
        link: { label: "Email admin dashboard", href: "/help?article=st2" },
      },
    ],
  },
  {
    id: "wf3",
    title: "Onboarding a new client",
    summary: "From adding the company to sending your first submission — get a new client active in under 10 minutes.",
    icon: Building2,
    duration: "8 min read",
    steps: [
      {
        title: "Add the company",
        detail: "Go to Clients and click Add Client. Enter the company name, industry, and size. This creates the company record all searches will be linked to.",
      },
      {
        title: "Add key contacts",
        detail: "In the new client's detail page, go to the Contacts tab. Add the hiring managers and stakeholders you'll be working with. Each contact gets their own portal notifications.",
        link: { label: "Managing clients and contacts", href: "/help?article=cl2" },
      },
      {
        title: "Create the first job search",
        detail: "In the client detail view, go to Jobs and click New Search (or use the global New Search from the Jobs page and select this client).",
        link: { label: "Creating a new search", href: "/help?article=j1" },
      },
      {
        title: "Make your first submission",
        detail: "Once you have candidates in the pipeline, submit the first one. The client automatically receives a branded portal email — this is their first contact with your Ikhaya portal.",
        link: { label: "Submitting a candidate to a client", href: "/help?article=c4" },
      },
      {
        title: "Walk the client through the portal",
        detail: "Share the portal URL with your client contact and walk them through the review flow. The first-time experience is intuitive, but a 5-minute walkthrough builds confidence. Use the portal demo video linked below.",
        link: { label: "Watch portal demo (opens in new tab)", href: "https://docs.ikhaya.io/tutorials/client-portal-demo" },
      },
    ],
  },
  {
    id: "wf5",
    title: "Scheduling and closing out an interview",
    summary: "From scheduling the interview to logging the outcome and advancing the candidate.",
    icon: Calendar,
    duration: "5 min read",
    steps: [
      {
        title: "Schedule from the pipeline card",
        detail: "Open the job pipeline. Find the candidate you want to interview. Click the ⋯ menu on their card and select Schedule Interview.",
      },
      {
        title: "Set format, date, and time",
        detail: "Choose the interview format (Video, Phone, On-site, or Panel), the date, and start time. Add any notes like the meeting link or location. Save.",
      },
      {
        title: "Confirm it appears in Interviews",
        detail: "Navigate to the Interviews page (G+I). The new interview should appear in the upcoming list. Today's interviews appear at the top with a live badge.",
        link: { label: "Scheduling interviews guide", href: "/help?article=iv1" },
      },
      {
        title: "Brief the candidate",
        detail: "Use the AI Copilot Interview tab on the candidate's profile to generate interview prep questions to share with the client's interviewers.",
        link: { label: "Using AI Copilot", href: "/help?article=ai1" },
      },
      {
        title: "Log the outcome",
        detail: "After the interview, return to the Interviews page and update the status: Completed, Cancelled, or No-show. The outcome is logged in the candidate's activity timeline.",
      },
      {
        title: "Advance or reject in the pipeline",
        detail: "If the interview went well, drag the candidate to the Offer stage in the job pipeline. If not, move to Rejected and add a note with the client's feedback.",
      },
    ],
  },
  {
    id: "wf6",
    title: "Closing a placement and collecting payment",
    summary: "Confirm a placed candidate, record the fee, and track invoice status through to payment.",
    icon: CheckCircle2,
    duration: "6 min read",
    steps: [
      {
        title: "Move the candidate to Placed",
        detail: "In the job pipeline, drag the candidate's card to the Placed stage. A confirmation dialog appears — enter the confirmed start date and salary.",
      },
      {
        title: "Set the confirmed fee",
        detail: "In the placement confirmation dialog, enter or confirm the fee amount. This is the number that appears in Placements and Revenue Analytics.",
      },
      {
        title: "Close the job",
        detail: "Go to the job detail page. Update the status to Closed/Filled. This removes the job from your active pipeline and records the close date.",
      },
      {
        title: "Find the placement record",
        detail: "Go to the Placements page (G+R). The new placement appears with status Pending. This means it's confirmed but not yet invoiced.",
        link: { label: "The Placements page", href: "/help?article=pl1" },
      },
      {
        title: "Update invoice status to Invoiced",
        detail: "When you send the invoice to the client, update the placement status to Invoiced using the ⋯ menu. This keeps your billing tracking accurate.",
      },
      {
        title: "Log payment when received",
        detail: "When payment arrives, click Log Payment, enter the amount and date. If partial, log each installment separately. Status updates to Partial → Paid automatically.",
        link: { label: "Logging payments", href: "/help?article=pl2" },
      },
    ],
  },
  {
    id: "wf4",
    title: "Onboarding a new team member",
    summary: "Get a new recruiter fully productive on the platform in their first session.",
    icon: Users,
    duration: "5 min read",
    steps: [
      {
        title: "Invite them from Settings → Team & Access",
        detail: "Enter their email and assign the Recruiter role. They'll receive an invite email with a sign-in link.",
        link: { label: "Inviting your team", href: "/help?article=gs2" },
      },
      {
        title: "Show them the global search",
        detail: "⌘K is the most important shortcut. It searches candidates, jobs, and clients simultaneously. Starting here saves significant navigation time.",
      },
      {
        title: "Walk through the Candidates page",
        detail: "Show them how to find a candidate, read the profile, add a note, and view the activity timeline. This is where they'll spend most of their time.",
        link: { label: "Using the activity timeline", href: "/help?article=c3" },
      },
      {
        title: "Assign them to an active job",
        detail: "In an existing job search, update the Team assignment to include them. They can then see the full pipeline and start making moves.",
      },
      {
        title: "Have them connect their email",
        detail: "Direct them to Settings → Integrations to connect Gmail or Outlook. Their previous candidate emails will backfill automatically.",
        link: { label: "Email integration setup", href: "/help?article=em1" },
      },
      {
        title: "Share the shortcuts reference",
        detail: "Print or bookmark /help → Keyboard Shortcuts. It lists every shortcut available. Most new recruiters find ⌘K (global search), G+C (go to candidates), and G+J (go to jobs) enough to start.",
      },
    ],
  },
];

// ─── FAQs ─────────────────────────────────────────────────────────────────────

const FAQS: FAQ[] = [
  {
    q: "Can I import candidates from LinkedIn?",
    a: "Yes. Use the Chrome Extension to save candidates from LinkedIn directly to Ikhaya. You can also import a CSV from LinkedIn Recruiter via Candidates → Import.",
    category: "Candidates & Jobs",
  },
  {
    q: "Why aren't my emails showing up on candidate profiles?",
    a: "Check that your email integration is active in Settings → Integrations. If connected, the email must share an address with the candidate's profile. Visit the Fuzzy Review inbox if you have unmatched emails.",
    category: "Email Integration",
  },
  {
    q: "How do I give a client access to review candidates?",
    a: "Go to the job, open the Shortlist, and click 'Share with Client'. This generates a secure portal link. You can also invite clients via Settings → Team & Access.",
    category: "Portal",
  },
  {
    q: "What does the AI Copilot have access to?",
    a: "The Copilot only sees data already in your Ikhaya workspace — candidate profiles, job details, and activity logs. No data leaves your agency's account.",
    category: "Reports & AI",
  },
  {
    q: "How do I track placement guarantees?",
    a: "On a placement record, open the Guarantee tab. Set the guarantee period length and start date. Ikhaya will alert you when a guarantee is about to expire.",
    category: "Interviews & Placements",
  },
];

// ─── Shortcuts ────────────────────────────────────────────────────────────────

const SHORTCUTS: { section: string; items: Shortcut[] }[] = [
  {
    section: "Navigation",
    items: [
      { keys: ["⌘", "K"],       label: "Global search" },
      { keys: ["G", "D"],        label: "Go to Dashboard" },
      { keys: ["G", "C"],        label: "Go to Candidates" },
      { keys: ["G", "J"],        label: "Go to Jobs" },
      { keys: ["G", "P"],        label: "Go to Pipeline" },
      { keys: ["G", "O"],        label: "Go to Outreach" },
      { keys: ["G", "R"],        label: "Go to Reports" },
      { keys: ["G", "S"],        label: "Go to Settings" },
    ],
  },
  {
    section: "Candidates",
    items: [
      { keys: ["N", "C"],        label: "New candidate" },
      { keys: ["⌘", "Enter"],   label: "Save changes" },
      { keys: ["Esc"],           label: "Close modal / cancel" },
    ],
  },
  {
    section: "Pipeline",
    items: [
      { keys: ["←", "→"],       label: "Navigate columns" },
      { keys: ["↑", "↓"],       label: "Navigate cards" },
      { keys: ["Space"],         label: "Open card detail" },
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [activeTab, setActiveTab]           = useState<"articles" | "workflows" | "shortcuts" | "faq" | "contact">("articles");
  const [searchQuery, setSearchQuery]       = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedFaq, setExpandedFaq]       = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const filteredArticles = ARTICLES.filter((a) => {
    const matchesSearch = !searchQuery ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "all" || a.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-brand-600" />
            <h1 className="text-xl font-bold text-foreground">Help Center</h1>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {([
            { id: "articles",  label: "Articles",   icon: BookOpen },
            { id: "workflows", label: "Workflows",  icon: Workflow },
            { id: "shortcuts", label: "Shortcuts",  icon: Keyboard },
            { id: "faq",       label: "FAQ",        icon: HelpCircle },
            { id: "contact",   label: "Contact",    icon: MessageCircle },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activeTab === id
                  ? "bg-brand-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 max-w-[1200px] w-full mx-auto">
        {/* Articles tab */}
        {activeTab === "articles" && (
          <div className="flex gap-6">
            {/* Category sidebar */}
            <div className="w-48 shrink-0">
              <div className="space-y-1">
                {CATEGORIES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveCategory(id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                      activeCategory === id
                        ? "bg-brand-50 text-brand-700"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Article list */}
            <div className="flex-1 space-y-3">
              {filteredArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No articles match your search</p>
                </div>
              ) : filteredArticles.map((article) => (
                <div key={article.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                    className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{article.title}</span>
                        {article.videoUrl && <Video className="h-3 w-3 text-brand-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{article.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />{article.readMins}m
                      </span>
                      {expandedArticle === article.id
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </button>
                  {expandedArticle === article.id && (
                    <div className="px-4 pb-4 border-t border-border">
                      <div className="pt-3 space-y-2">
                        {article.content.map((para, i) => (
                          <p key={i} className="text-xs text-foreground leading-relaxed">{para}</p>
                        ))}
                        {article.tips && article.tips.length > 0 && (
                          <div className="mt-3 rounded-lg bg-brand-50 border border-brand-100 p-3">
                            <p className="text-[11px] font-semibold text-brand-700 mb-1.5 flex items-center gap-1">
                              <Star className="h-3 w-3" /> Tips
                            </p>
                            <ul className="space-y-1">
                              {article.tips.map((tip, i) => (
                                <li key={i} className="text-[11px] text-brand-700 flex gap-1.5">
                                  <span className="shrink-0 mt-0.5">·</span>{tip}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workflows tab */}
        {activeTab === "workflows" && (
          <div className="space-y-4">
            {WORKFLOWS.map((wf) => {
              const Icon = wf.icon;
              const isOpen = expandedArticle === wf.id;
              return (
                <div key={wf.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedArticle(isOpen ? null : wf.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <Icon className="h-5 w-5 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{wf.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{wf.summary}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />{wf.duration}
                      </span>
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-border">
                      <ol className="mt-4 space-y-4">
                        {wf.steps.map((step, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 mt-0.5">
                              {i + 1}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-foreground">{step.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                              {step.link && (
                                <a href={step.link.href} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline">
                                  {step.link.label} <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Shortcuts tab */}
        {activeTab === "shortcuts" && (
          <div className="space-y-6">
            {SHORTCUTS.map((section) => (
              <div key={section.section}>
                <h2 className="text-sm font-semibold text-foreground mb-3">{section.section}</h2>
                <div className="grid grid-cols-2 gap-2">
                  {section.items.map((shortcut, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                      <span className="text-xs text-foreground">{shortcut.label}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, ki) => (
                          <kbd key={ki} className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAQ tab */}
        {activeTab === "faq" && (
          <div className="space-y-2 max-w-3xl">
            {FAQS.map((faq, i) => {
              const isOpen = expandedFaq === String(i);
              return (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : String(i))}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{faq.q}</p>
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-border">
                      <p className="text-xs text-muted-foreground pt-3 leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Contact tab */}
        {activeTab === "contact" && (
          <div className="max-w-lg space-y-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <MessageCircle className="h-5 w-5 text-brand-600" />
                <h2 className="text-sm font-semibold text-foreground">Contact Support</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Subject</label>
                  <input
                    type="text"
                    placeholder="Briefly describe your issue"
                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">Message</label>
                  <textarea
                    rows={5}
                    placeholder="Describe the problem in detail..."
                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <button
                  onClick={() => toast.success("Message sent! We'll respond within 24 hours.")}
                  className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Message
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 inline mr-1 text-brand-600" />
                Support hours: Monday–Friday, 9am–6pm GMT. Average response time: under 4 hours.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
