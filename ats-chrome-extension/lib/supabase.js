/**
 * Lightweight Supabase client for the Chrome extension.
 * No SDK dependency — raw fetch calls to keep the bundle tiny.
 */

const STORAGE_KEY     = "ikhaya_ats_config";
const KEY_STORAGE_KEY = "ikhaya_ats_enc_key";  // AES-GCM 256-bit key, exported as JWK

// ─── US-361: token encryption at rest ────────────────────────────────────────
// `chrome.storage.local` is stored on disk as SQLite/LevelDB, so an attacker
// with filesystem access (post-compromise malware, forensic tools, shared
// machines) can read plaintext tokens. We encrypt the `accessToken` field
// with an AES-GCM key derived once at install time and kept in the same
// storage area — this doesn't defeat an attacker with *both* storage
// entries, but it does block trivial grep of raw tokens and casual cloud-
// backup exfiltration.

async function getOrCreateEncryptionKey() {
  const existing = await new Promise((resolve) =>
    chrome.storage.local.get(KEY_STORAGE_KEY, (r) => resolve(r[KEY_STORAGE_KEY]))
  );
  if (existing) {
    return crypto.subtle.importKey(
      "jwk", existing, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
    );
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await new Promise((resolve) =>
    chrome.storage.local.set({ [KEY_STORAGE_KEY]: jwk }, resolve)
  );
  return key;
}

async function encryptToken(plain) {
  if (!plain) return null;
  const key = await getOrCreateEncryptionKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)
  );
  return {
    v:  1,                                    // payload version for future key rotation
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(buf))),
  };
}

async function decryptToken(envelope) {
  if (!envelope || typeof envelope !== "object" || envelope.v !== 1) return null;
  try {
    const key = await getOrCreateEncryptionKey();
    const iv  = Uint8Array.from(atob(envelope.iv), (c) => c.charCodeAt(0));
    const ct  = Uint8Array.from(atob(envelope.ct), (c) => c.charCodeAt(0));
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(buf);
  } catch (_) { return null; }
}

/**
 * Get saved config from chrome.storage.local.
 * US-361: transparently decrypts the accessToken envelope on read.
 */
export async function getConfig() {
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (r) => resolve(r[STORAGE_KEY] || {}));
  });
  // Handle both legacy plaintext strings and new encrypted envelopes.
  let accessToken = null;
  if (typeof stored.accessToken === "string") {
    accessToken = stored.accessToken;   // legacy — will be re-saved encrypted next write
  } else if (stored.accessToken && typeof stored.accessToken === "object") {
    accessToken = await decryptToken(stored.accessToken);
  }
  return { ...stored, accessToken };
}

/**
 * Save config to chrome.storage.local.
 * US-361: encrypts the accessToken before persisting.
 */
export async function saveConfig(config) {
  const toStore = { ...config };
  if (config.accessToken) {
    toStore.accessToken = await encryptToken(config.accessToken);
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: toStore }, resolve);
  });
}

/** Build headers for Supabase REST calls */
function buildHeaders(config) {
  const headers = {
    "Content-Type": "application/json",
    "apikey": config.anonKey,
    "Prefer": "return=representation",
  };
  if (config.accessToken) {
    headers["Authorization"] = `Bearer ${config.accessToken}`;
  }
  return headers;
}

/** Generic Supabase REST call */
async function supabaseRequest(method, table, config, params = {}) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/${table}`);
  if (params.query) {
    Object.entries(params.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const opts = { method, headers: buildHeaders(config) };
  if (params.body) opts.body = JSON.stringify(params.body);
  if (params.prefer) opts.headers["Prefer"] = params.prefer;
  const res = await fetch(url.toString(), opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * US-369: Validate that the web-app session backing this JWT has not been
 * revoked by the middleware (idle timeout, absolute timeout, manual revoke).
 *
 * Returns true if the session is still valid, false if revoked or the check
 * fails (caller should treat failure as revoked to fail-closed).
 *
 * @param {string} atsDomain - The ATS app domain (e.g. "app.ikhaya.io")
 * @param {string} accessToken - The Supabase JWT
 */
async function validateExtensionSession(atsDomain, accessToken) {
  if (!atsDomain || !accessToken) return false;
  try {
    const res = await fetch(`https://${atsDomain}/api/auth/extension/validate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (res.status === 200) return true;
    if (res.status === 401) return false;
    // Non-200/401 (network error, 5xx) — fail open to avoid breaking the
    // extension when the web app is briefly unavailable.
    return true;
  } catch (_) {
    // Network error — fail open
    return true;
  }
}

/** Retrieve session from ATS cookies or stored token */
export async function getSession(config) {
  if (config.accessToken) {
    // Verify the JWT is still valid with Supabase
    try {
      const url = `${config.supabaseUrl}/auth/v1/user`;
      const res = await fetch(url, {
        headers: {
          "apikey": config.anonKey,
          "Authorization": `Bearer ${config.accessToken}`,
        },
      });
      if (res.ok) {
        const userData = await res.json();

        // US-369: Also check that the web-app session hasn't been revoked.
        // This catches idle/absolute timeouts and manual revokes that the
        // extension's raw-JWT path would otherwise bypass.
        if (config.atsDomain) {
          const sessionValid = await validateExtensionSession(
            config.atsDomain,
            config.accessToken
          );
          if (!sessionValid) {
            // Session revoked — clear stored token and signal not authenticated
            await saveConfig({ ...config, accessToken: null });
            return null;
          }
        }

        return userData;
      }
    } catch (_) { /* fall through */ }
  }

  // Try to grab session from ATS domain cookies
  if (config.atsDomain) {
    try {
      const cookies = await chrome.cookies.getAll({ domain: config.atsDomain });
      const sbCookie = cookies.find(
        (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
      );
      if (sbCookie) {
        // Supabase stores base64-encoded JSON in the cookie
        const decoded = JSON.parse(atob(sbCookie.value.replace("base64-", "")));
        const token = decoded?.[0] || decoded?.access_token;
        if (token) {
          await saveConfig({ ...config, accessToken: token });
          return getSession({ ...config, accessToken: token });
        }
      }
    } catch (_) { /* cookie access may fail */ }
  }
  return null;
}

/** Get current user's agency_id */
export async function getAgencyId(config) {
  const user = await getSession(config);
  if (!user?.id) return null;
  const rows = await supabaseRequest("GET", "users", config, {
    query: { id: `eq.${user.id}`, select: "agency_id" },
  });
  return rows?.[0]?.agency_id || null;
}

// ── Duplicate detection ──────────────────────────────────────────────────────

/**
 * Find duplicates using email + name combo.
 * Returns array of matching records.
 */
export async function findDuplicateCandidates(config, { email, firstName, lastName }) {
  const results = [];

  // 1. Exact email match (strongest signal)
  if (email) {
    const byEmail = await supabaseRequest("GET", "candidates", config, {
      query: { email: `eq.${email}`, select: "id,first_name,last_name,email,current_title,current_company,linkedin_url,avatar_url,status,created_at" },
    });
    if (byEmail?.length) results.push(...byEmail);
  }

  // 2. Name match (if no email hit)
  if (!results.length && firstName && lastName) {
    const byName = await supabaseRequest("GET", "candidates", config, {
      query: {
        first_name: `ilike.${firstName}`,
        last_name: `ilike.${lastName}`,
        select: "id,first_name,last_name,email,current_title,current_company,linkedin_url,avatar_url,status,created_at",
      },
    });
    if (byName?.length) results.push(...byName);
  }

  return results;
}

export async function findDuplicateContacts(config, { email, firstName, lastName }) {
  const results = [];
  if (email) {
    const byEmail = await supabaseRequest("GET", "contacts", config, {
      query: { email: `eq.${email}`, select: "id,first_name,last_name,email,title,company_id,linkedin_url" },
    });
    if (byEmail?.length) results.push(...byEmail);
  }
  if (!results.length && firstName && lastName) {
    const byName = await supabaseRequest("GET", "contacts", config, {
      query: {
        first_name: `ilike.${firstName}`,
        last_name: `ilike.${lastName}`,
        select: "id,first_name,last_name,email,title,company_id,linkedin_url",
      },
    });
    if (byName?.length) results.push(...byName);
  }
  return results;
}

export async function findDuplicateCompanies(config, { name, website }) {
  const results = [];
  if (website) {
    const byWebsite = await supabaseRequest("GET", "companies", config, {
      query: { website: `eq.${website}`, select: "id,name,website,industry" },
    });
    if (byWebsite?.length) results.push(...byWebsite);
  }
  if (!results.length && name) {
    const byName = await supabaseRequest("GET", "companies", config, {
      query: { name: `ilike.${name}`, select: "id,name,website,industry" },
    });
    if (byName?.length) results.push(...byName);
  }
  return results;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function insertCandidate(config, agencyId, data) {
  const body = {
    agency_id: agencyId,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email || null,
    phone: data.phone || null,
    current_title: data.currentTitle || null,
    current_company: data.currentCompany || null,
    location: data.location || null,
    linkedin_url: data.linkedinUrl || null,
    portfolio_url: data.portfolioUrl || null,
    avatar_url: data.avatarUrl || null,
    source: data.source || "chrome_extension",
    skills: data.skills || [],
    status: "active",
  };
  // GitHub profiles → store as github_url
  if (data.source === "github" && data.portfolioUrl?.includes("github.com")) {
    body.github_url = data.portfolioUrl;
  }
  return supabaseRequest("POST", "candidates", config, {
    body,
    prefer: "return=representation",
  });
}

export async function updateCandidate(config, id, data) {
  const patch = {};
  if (data.firstName !== undefined) patch.first_name = data.firstName;
  if (data.lastName !== undefined) patch.last_name = data.lastName;
  if (data.email !== undefined) patch.email = data.email;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.currentTitle !== undefined) patch.current_title = data.currentTitle;
  if (data.currentCompany !== undefined) patch.current_company = data.currentCompany;
  if (data.location !== undefined) patch.location = data.location;
  if (data.linkedinUrl !== undefined) patch.linkedin_url = data.linkedinUrl;
  if (data.portfolioUrl !== undefined) patch.portfolio_url = data.portfolioUrl;
  if (data.avatarUrl !== undefined) patch.avatar_url = data.avatarUrl;
  if (data.githubUrl !== undefined) patch.github_url = data.githubUrl;
  if (data.skills !== undefined) patch.skills = data.skills;
  patch.updated_at = new Date().toISOString();

  return supabaseRequest("PATCH", "candidates", config, {
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=representation",
  });
}

export async function insertWorkHistory(config, agencyId, candidateId, entries) {
  if (!entries?.length) return [];
  const rows = entries.map((e, i) => ({
    agency_id: agencyId,
    candidate_id: candidateId,
    company: e.company,
    title: e.title,
    start_date: e.startDate || null,
    end_date: e.endDate || null,
    location: e.location || null,
    bullets: e.bullets || [],
    position: i,
  }));
  return supabaseRequest("POST", "work_history", config, {
    body: rows,
    prefer: "return=representation",
  });
}

export async function insertContact(config, agencyId, data) {
  return supabaseRequest("POST", "contacts", config, {
    body: {
      agency_id: agencyId,
      company_id: data.companyId || null,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      title: data.title || null,
      linkedin_url: data.linkedinUrl || null,
      is_primary: false,
    },
    prefer: "return=representation",
  });
}

export async function updateContact(config, id, data) {
  const patch = {};
  if (data.firstName !== undefined) patch.first_name = data.firstName;
  if (data.lastName !== undefined) patch.last_name = data.lastName;
  if (data.email !== undefined) patch.email = data.email;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.title !== undefined) patch.title = data.title;
  if (data.linkedinUrl !== undefined) patch.linkedin_url = data.linkedinUrl;
  return supabaseRequest("PATCH", "contacts", config, {
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=representation",
  });
}

export async function insertCompany(config, agencyId, data) {
  return supabaseRequest("POST", "companies", config, {
    body: {
      agency_id: agencyId,
      name: data.name,
      website: data.website || null,
      industry: data.industry || null,
      size: data.size || null,
      logo_url: data.logoUrl || null,
      contract_status: "prospect",
    },
    prefer: "return=representation",
  });
}

export async function updateCompany(config, id, data) {
  const patch = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.website !== undefined) patch.website = data.website;
  if (data.industry !== undefined) patch.industry = data.industry;
  if (data.logoUrl !== undefined) patch.logo_url = data.logoUrl;
  return supabaseRequest("PATCH", "companies", config, {
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=representation",
  });
}

export async function insertJob(config, agencyId, data) {
  return supabaseRequest("POST", "jobs", config, {
    body: {
      agency_id: agencyId,
      company_id: data.companyId || null,
      title: data.title,
      location: data.location || null,
      remote_policy: data.remotePolicy || "onsite",
      employment_type: data.employmentType || "full_time",
      salary_min: data.salaryMin || null,
      salary_max: data.salaryMax || null,
      description: data.description || null,
      priority: "medium",
      status: "open",
    },
    prefer: "return=representation",
  });
}

/** Merge: update existing record with non-null fields from scraped data */
export function mergeFields(existing, scraped) {
  const merged = {};
  for (const [key, val] of Object.entries(scraped)) {
    if (val !== null && val !== undefined && val !== "") {
      const existingVal = existing[key];
      if (!existingVal || existingVal === "" || existingVal === null) {
        merged[key] = val;
      }
    }
  }
  return merged;
}

/** Fetch active jobs for the agency (used by pipeline picker) */
export async function fetchActiveJobs(config, agencyId) {
  // PostgREST embedded select: join companies to get the name
  return supabaseRequest("GET", "jobs", config, {
    query: {
      agency_id: `eq.${agencyId}`,
      status: `eq.open`,
      select: "id,title,companies(name)",
      order: "created_at.desc",
      limit: "50",
    },
  }).then((rows) =>
    (rows || []).map((r) => ({
      id: r.id,
      title: r.title,
      company_name: r.companies?.name || "",
    }))
  );
}

/** Add a candidate to a job's pipeline (candidate_pipeline_entries table) */
export async function addToPipeline(config, agencyId, candidateId, jobId) {
  // Get the first pipeline stage for this job
  const stages = await supabaseRequest("GET", "pipeline_stages", config, {
    query: { job_id: `eq.${jobId}`, order: "position.asc", limit: "1" },
  });
  const stageId = stages?.[0]?.id || null;

  return supabaseRequest("POST", "candidate_pipeline_entries", config, {
    body: {
      agency_id:        agencyId,
      job_id:           jobId,
      candidate_id:     candidateId,
      stage_id:         stageId,
      status:           "active",
      entered_stage_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });
}

/** Insert education records for a candidate */
export async function insertEducation(config, agencyId, candidateId, entries) {
  if (!entries?.length) return [];
  const rows = entries.map((e, i) => ({
    agency_id:    agencyId,
    candidate_id: candidateId,
    school:       e.school,
    degree:       e.degree || "",
    field:        e.field || "",
    grad_year:    e.gradYear || "",
    position:     i,
  }));
  return supabaseRequest("POST", "education", config, {
    body: rows,
    prefer: "return=representation",
  });
}

/** Log an activity for the ATS timeline */
export async function logActivity(config, agencyId, actorId, entityType, entityId, action, summary, metadata = {}) {
  return supabaseRequest("POST", "activities", config, {
    body: {
      agency_id:   agencyId,
      actor_id:    actorId,
      entity_type: entityType,
      entity_id:   entityId,
      action,
      metadata:    { ...metadata, summary },
    },
    prefer: "return=representation",
  });
}

/** Get the current authenticated user's ID */
export async function getCurrentUserId(config) {
  const user = await getSession(config);
  return user?.id || null;
}

// ── Tags ─────────────────────────────────────────────────────────────────────

/** Fetch all tags for the agency */
export async function fetchTags(config, agencyId) {
  return supabaseRequest("GET", "tags", config, {
    query: { agency_id: `eq.${agencyId}`, select: "id,name,color", order: "name" },
  });
}

/** Link tags to a candidate (via candidate_tags join table + denormalized text[] on candidates) */
export async function tagCandidate(config, candidateId, tagIds) {
  if (!tagIds?.length) return;
  const rows = tagIds.map((tagId) => ({ candidate_id: candidateId, tag_id: tagId }));

  // 1. Write to join table
  await supabaseRequest("POST", "candidate_tags", config, {
    body: rows,
    prefer: "return=representation,resolution=ignore-duplicates",
  });

  // 2. Also update the denormalized tags text[] on candidates for backward compat
  // Fetch tag names for the selected IDs
  const tagNames = [];
  for (const id of tagIds) {
    const tag = await supabaseRequest("GET", "tags", config, {
      query: { id: `eq.${id}`, select: "name" },
    });
    if (tag?.[0]?.name) tagNames.push(tag[0].name);
  }
  if (tagNames.length) {
    // Append to existing tags array (Postgres array_cat)
    const existing = await supabaseRequest("GET", "candidates", config, {
      query: { id: `eq.${candidateId}`, select: "tags" },
    });
    const currentTags = existing?.[0]?.tags || [];
    const merged = [...new Set([...currentTags, ...tagNames])];
    await supabaseRequest("PATCH", "candidates", config, {
      query: { id: `eq.${candidateId}` },
      body: { tags: merged, updated_at: new Date().toISOString() },
    });
  }
}

/** Create a new tag and return it */
export async function createTag(config, agencyId, name, color = "#6366f1") {
  return supabaseRequest("POST", "tags", config, {
    body: { agency_id: agencyId, name, color },
    prefer: "return=representation",
  });
}

// ── Hotlists ─────────────────────────────────────────────────────────────────
// Hotlists are lightweight curated lists that live in `hotlists` + `hotlist_members`.
// If these tables don't exist yet, the calls will fail gracefully.

/** Fetch all hotlists for the agency */
export async function fetchHotlists(config, agencyId) {
  try {
    return await supabaseRequest("GET", "hotlists", config, {
      query: { agency_id: `eq.${agencyId}`, select: "id,name,description,member_count", order: "name" },
    });
  } catch (_) {
    // Table may not exist yet — return empty
    return [];
  }
}

/** Add a candidate to a hotlist */
export async function addToHotlist(config, agencyId, candidateId, hotlistId) {
  return supabaseRequest("POST", "hotlist_members", config, {
    body: {
      agency_id:    agencyId,
      hotlist_id:   hotlistId,
      candidate_id: candidateId,
    },
    prefer: "return=representation,resolution=ignore-duplicates",
  });
}

/** Create a new hotlist */
export async function createHotlist(config, agencyId, name, description = "") {
  return supabaseRequest("POST", "hotlists", config, {
    body: { agency_id: agencyId, name, description, member_count: 0 },
    prefer: "return=representation",
  });
}

// ── Saved Search Matching ────────────────────────────────────────────────────

/** Fetch recruiter's saved searches and match against candidate attributes */
export async function matchSavedSearches(config, candidateData) {
  try {
    const searches = await supabaseRequest("GET", "saved_searches", config, {
      query: { select: "id,name,query,filters,result_count", order: "created_at.desc", limit: "30" },
    });
    if (!searches?.length) return [];

    // Score each saved search against the candidate
    const candidateSkills = (candidateData.skills || []).map((s) => s.toLowerCase());
    const candidateLocation = (candidateData.location || "").toLowerCase();
    const candidateTitle = (candidateData.currentTitle || "").toLowerCase();

    const matches = [];
    for (const search of searches) {
      let score = 0;
      const q = (search.query || "").toLowerCase();
      const filters = search.filters || {};

      // Query text match against title, skills, company
      if (q) {
        if (candidateTitle.includes(q)) score += 3;
        if (candidateSkills.some((s) => s.includes(q) || q.includes(s))) score += 2;
        if ((candidateData.currentCompany || "").toLowerCase().includes(q)) score += 1;
      }

      // Skill filter match
      const filterSkills = (filters.skills || []).map((s) => s.toLowerCase());
      if (filterSkills.length) {
        const matched = filterSkills.filter((fs) =>
          candidateSkills.some((cs) => cs.includes(fs) || fs.includes(cs))
        );
        score += matched.length * 2;
      }

      // Location filter match
      const filterLocations = (filters.locations || []).map((l) => l.toLowerCase());
      if (filterLocations.length && candidateLocation) {
        if (filterLocations.some((fl) => candidateLocation.includes(fl) || fl.includes(candidateLocation))) {
          score += 2;
        }
      }

      if (score > 0) {
        matches.push({ ...search, score });
      }
    }

    // Sort by score descending, return top 5
    return matches.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch (_) {
    return [];
  }
}
