# Chrome Extension → ATS Feature Handoff

> For the Product, Design, and Engineering agents building the ATS web app.
> These features are used by the Chrome extension and need ATS-side support.

---

## 1. Hotlists (New Feature)

### What it is
Recruiters curate shortlists of candidates outside of any specific job pipeline. Think "Top React Engineers", "Passive VPs for Q3", "My warm network". The Chrome extension lets recruiters add imported candidates directly to a hotlist.

### DB schema needed

```sql
-- Hotlists table
CREATE TABLE hotlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id),
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by  UUID REFERENCES users(id),
  member_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Hotlist members (join table)
CREATE TABLE hotlist_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES agencies(id),
  hotlist_id    UUID NOT NULL REFERENCES hotlists(id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  added_by      UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hotlist_id, candidate_id)
);

-- RLS: agency-scoped
ALTER TABLE hotlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotlist_members ENABLE ROW LEVEL SECURITY;

-- Trigger to keep member_count in sync
CREATE OR REPLACE FUNCTION update_hotlist_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE hotlists SET member_count = member_count + 1 WHERE id = NEW.hotlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE hotlists SET member_count = member_count - 1 WHERE id = OLD.hotlist_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hotlist_member_count
AFTER INSERT OR DELETE ON hotlist_members
FOR EACH ROW EXECUTE FUNCTION update_hotlist_member_count();
```

### ATS UI needed
- **Sidebar nav item**: "Hotlists" (could live under Candidates or as its own section)
- **Hotlist list page**: name, member count, created date, owner
- **Hotlist detail page**: table of candidates, remove button, bulk actions
- **Candidate profile sidebar**: "Hotlists" chip showing which hotlists they're on
- **Candidates list page**: filter by hotlist

---

## 2. Candidate Tags (Join Table)

### What it is
The Chrome extension auto-matches scraped skills to org tags and lets recruiters assign them on import. This requires a `candidate_tags` join table.

### DB schema needed (if not already present)

```sql
CREATE TABLE IF NOT EXISTS candidate_tags (
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  tag_id       UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (candidate_id, tag_id)
);
```

### ATS UI needed
- Candidate profile should show tags (may already exist)
- Candidates list should be filterable by tag (may already exist)
- Tag management in Settings (may already exist)

---

## 3. Auto-Match to Active Saved Searches (New Feature)

### What it is
When a recruiter imports a candidate via the extension, it runs the candidate's skills, location, and title against the recruiter's saved searches. If there's a match, the extension surfaces it and the recruiter can "add" the candidate to that search's context (essentially flagging them as a match).

### How the extension does it today
The extension fetches all saved searches and scores them client-side against the candidate's attributes (skills overlap, location match, title keyword match). This is a v1 heuristic — it works but isn't precise.

### What the ATS should build
1. **Server-side match endpoint**: Rather than client-side heuristic, an edge function or RPC that runs the candidate through saved search filters properly (respecting all filter fields, not just skills/location).
2. **"Matched candidates" on saved search detail page**: When a saved search is viewed, show candidates that were flagged as matches (from the extension or from a periodic background job).
3. **Notifications**: When a new candidate matches an active search, notify the recruiter who owns that search.

### Suggested DB addition

```sql
-- Saved search matches (tracks which candidates matched which searches)
CREATE TABLE saved_search_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  match_score   REAL DEFAULT 0,
  source        TEXT DEFAULT 'chrome_extension',  -- or 'background_job', 'manual'
  reviewed      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(search_id, candidate_id)
);
```

---

## 4. "Sourced" Stage Convention

### What it is
When the extension adds a candidate to a job pipeline, it drops them into the first stage (position 1). The expectation is that this is a "Sourced" or "Applied" stage — the top of funnel.

### What the ATS should ensure
- Default pipeline stage creation (in `addJob`) should always have stage 1 be named "Sourced" or "Applied" (it currently creates "Applied" at position 1 — that's fine)
- The pipeline Kanban board should visually distinguish "Sourced" stage cards (e.g., a subtle badge indicating the source: "Chrome Extension", "CSV Import", "Manual")

---

## 5. Activity Types from Extension

The extension logs activities with these patterns:

| action | summary | metadata |
|--------|---------|----------|
| `note` | "Imported via Chrome extension from linkedin" | `{ source: "linkedin", action: "import" }` |
| `note` | "Updated via Chrome extension (merged from github)" | `{ source: "github", action: "merge" }` |
| `stage_change` | "Added to pipeline via Chrome extension" | `{ source: "chrome_extension", job_id, stage: "Sourced" }` |

The activity timeline should render these appropriately — perhaps with a Chrome/extension icon instead of the default note icon.
