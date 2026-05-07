# Ikhaya ATS Chrome Extension — Setup Guide

## Install (Developer Mode)

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `ats-chrome-extension` folder
4. The Ikhaya icon appears in your toolbar

## Connect to Your ATS

1. Click the extension icon → gear icon (Settings)
2. Fill in:
   - **Supabase URL**: `https://jjxkzmxugguietyfqqai.supabase.co`
   - **Anon Key**: your project's `anon` / `public` key (from Supabase → Settings → API)
   - **ATS Domain**: the domain where your ATS is hosted (e.g., `your-app.vercel.app`)
     — OR paste an **Access Token** directly (grab from browser DevTools → Application → Cookies → `sb-*-auth-token`)
3. Click **Save & Connect** — you should see "Connected as [your email]"

## Usage

### Import a Candidate
1. Navigate to a **LinkedIn profile** or **GitHub profile**
2. Click the extension icon → **Scrape This Page**
3. Review the preview (name, title, skills, work history, education)
4. Click **Import Candidate** — or if a duplicate is found, choose **Merge / Update** or **Import as New**
5. After import, optionally pick a job from the pipeline picker to add them to a pipeline stage

### Import a Client
1. Navigate to a **LinkedIn company page** or **GitHub organization page**
2. Scrape → **Import Client**

### Import a Job/REQ
1. Navigate to a **LinkedIn job posting** (`linkedin.com/jobs/view/...`)
2. Scrape → **Import Job/REQ**

## Supported Sites

| Site | Candidate | Client | Job/REQ |
|------|-----------|--------|---------|
| LinkedIn | Profile pages (`/in/...`) | Company pages (`/company/...`) | Job pages (`/jobs/view/...`) |
| GitHub | User profiles (`/username`) | Org pages (`/orgname`) | — |

## DB Schema Requirements

The extension writes directly to these Supabase tables (all require `agency_id` via RLS):

- `candidates` — with `avatar_url`, `portfolio_url`, `linkedin_url` columns
- `work_history` — linked to candidate
- `education` — linked to candidate
- `companies` — client records
- `contacts` — client contacts
- `jobs` — job/REQ records
- `pipeline_stages` — read-only, for pipeline picker
- `candidate_pipeline_entries` — to add candidates to job pipelines
- `activities` — logs import/merge events to the ATS timeline

## Chrome Web Store Publishing

Before publishing, you'll need:
1. A **privacy policy URL** — draft included at `privacy-policy.html`
2. **Screenshots** (1280×800 or 640×400) of the popup in action
3. A **128×128 icon** (included in `icons/`)
4. A $5 one-time Chrome Web Store developer registration fee
