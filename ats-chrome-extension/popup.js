/**
 * Popup controller — orchestrates scraping, dedup, import/update/merge.
 */

import {
  getConfig, saveConfig, getSession, getAgencyId, getCurrentUserId,
  findDuplicateCandidates, findDuplicateContacts, findDuplicateCompanies,
  insertCandidate, updateCandidate, insertWorkHistory, insertEducation,
  insertContact, updateContact,
  insertCompany, updateCompany,
  insertJob,
  fetchActiveJobs, addToPipeline,
  fetchTags, tagCandidate, createTag,
  fetchHotlists, addToHotlist, createHotlist,
  matchSavedSearches,
  logActivity,
  mergeFields,
} from "./lib/supabase.js";

// ── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const authStatus     = $("authStatus");
const settingsPanel  = $("settingsPanel");
const settingsBtn    = $("settingsBtn");
const saveSettingsBtn = $("saveSettingsBtn");
const cancelSettingsBtn = $("cancelSettingsBtn");
const mainPanel      = $("mainPanel");
const emptyState     = $("emptyState");
const scrapeBtn      = $("scrapeBtn");
const previewCard    = $("previewCard");
const previewAvatar  = $("previewAvatar");
const previewName    = $("previewName");
const previewTitle   = $("previewTitle");
const previewSource  = $("previewSource");
const previewDetails = $("previewDetails");
const previewSkills  = $("previewSkills");
const previewWork    = $("previewWorkHistory");
const dupSection     = $("dupSection");
const dupMessage     = $("dupMessage");
const dupList        = $("dupList");
const mergeBtn       = $("mergeBtn");
const importAnywayBtn = $("importAnywayBtn");
const actionRow      = $("actionRow");
const importBtn      = $("importBtn");
const updateBtn      = $("updateBtn");
const statusMsg         = $("statusMsg");
const postImportPanel   = $("postImportPanel");
const jobPicker         = $("jobPicker");
const addPipelineBtn    = $("addPipelineBtn");
const tagChips          = $("tagChips");
const newTagInput       = $("newTagInput");
const addTagBtn         = $("addTagBtn");
const applyTagsBtn      = $("applyTagsBtn");
const hotlistSection    = $("hotlistSection");
const hotlistPicker     = $("hotlistPicker");
const newHotlistInput   = $("newHotlistInput");
const createHotlistBtn  = $("createHotlistBtn");
const addHotlistBtn     = $("addHotlistBtn");
const searchMatchSection = $("searchMatchSection");
const searchMatchList   = $("searchMatchList");

// ── State ────────────────────────────────────────────────────────────────────

let config = {};
let scrapedData = null;
let duplicates = [];
let selectedDup = null;
let agencyId = null;
let importedCandidateId = null;  // set after a successful candidate import
let activeJobs = [];             // loaded once for pipeline picker
let orgTags = [];                // all tags for the agency
let selectedTagIds = new Set();  // tags selected by the user
let orgHotlists = [];            // all hotlists for the agency

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  config = await getConfig();
  populateSettings();
  await checkAuth();
}

function populateSettings() {
  $("inputUrl").value = config.supabaseUrl || "";
  $("inputAnonKey").value = config.anonKey || "";
  $("inputDomain").value = config.atsDomain || "";
  $("inputToken").value = config.accessToken || "";
}

async function checkAuth() {
  if (!config.supabaseUrl || !config.anonKey) {
    authStatus.textContent = "Not configured";
    authStatus.className = "auth-badge disconnected";
    return false;
  }
  try {
    const user = await getSession(config);
    if (user?.id) {
      authStatus.textContent = `Connected as ${user.email || user.id.slice(0, 8)}`;
      authStatus.className = "auth-badge connected";
      agencyId = await getAgencyId(config);
      return true;
    }
  } catch (_) { /* ignore */ }
  authStatus.textContent = "Auth failed — check settings";
  authStatus.className = "auth-badge disconnected";
  return false;
}

// ── Settings ─────────────────────────────────────────────────────────────────

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

cancelSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
  populateSettings();
});

saveSettingsBtn.addEventListener("click", async () => {
  config = {
    supabaseUrl: $("inputUrl").value.trim().replace(/\/$/, ""),
    anonKey: $("inputAnonKey").value.trim(),
    atsDomain: $("inputDomain").value.trim(),
    accessToken: $("inputToken").value.trim() || config.accessToken,
  };
  await saveConfig(config);

  // US-363: request the "cookies" permission at runtime only when the user
  // has actually configured an ATS domain. On first install we only asked
  // for activeTab + storage; this prompt appears exactly when it's needed
  // and the user can deny it without breaking the raw-token auth path.
  if (config.atsDomain) {
    try {
      const granted = await chrome.permissions.request({ permissions: ["cookies"] });
      if (!granted) {
        showStatus("Cookie access denied — falling back to manual token auth.", "warning");
      }
    } catch (_) { /* older Chrome without the prompt API */ }
  }

  const ok = await checkAuth();
  if (ok) {
    settingsPanel.classList.add("hidden");
    showStatus("Connected successfully!", "success");
  } else {
    showStatus("Could not authenticate. Check your credentials.", "error");
  }
});

// ── Scrape ───────────────────────────────────────────────────────────────────

scrapeBtn.addEventListener("click", async () => {
  resetUI();
  scrapeBtn.disabled = true;
  scrapeBtn.innerHTML = '<span class="spinner"></span>Scraping...';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "scrapeActiveTab" }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    if (!response?.ok) throw new Error(response?.error || "Scrape failed");

    scrapedData = response.data;
    renderPreview(scrapedData);

    // Check for duplicates if connected
    if (agencyId) {
      await checkDuplicates(scrapedData);
    }

    if (!dupSection.classList.contains("hidden")) {
      // Duplicates found — show merge options
    } else {
      actionRow.classList.remove("hidden");
    }
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    scrapeBtn.disabled = false;
    scrapeBtn.textContent = "Scrape This Page";
  }
});

// ── Preview rendering ────────────────────────────────────────────────────────

function renderPreview(data) {
  if (!data || data.type === "unknown") {
    showStatus(data?.error || "Could not detect content on this page.", "info");
    return;
  }

  emptyState.classList.add("hidden");
  previewCard.classList.remove("hidden");

  // Avatar
  if (data.avatarUrl || data.logoUrl) {
    previewAvatar.src = data.avatarUrl || data.logoUrl;
    previewAvatar.style.display = "block";
  } else {
    previewAvatar.style.display = "none";
  }

  // Name / title
  if (data.type === "candidate") {
    previewName.textContent = `${data.firstName} ${data.lastName}`.trim();
    previewTitle.textContent = data.currentTitle || "";
  } else if (data.type === "client") {
    previewName.textContent = data.name || "";
    previewTitle.textContent = data.industry || "";
  } else if (data.type === "job") {
    previewName.textContent = data.title || "";
    previewTitle.textContent = data.companyName || "";
  }

  previewSource.textContent = `${data.source} · ${data.type}`;

  // Details
  const details = [];
  if (data.email) details.push(["Email", data.email]);
  if (data.phone) details.push(["Phone", data.phone]);
  if (data.location) details.push(["Location", data.location]);
  if (data.currentCompany) details.push(["Company", data.currentCompany]);
  if (data.website) details.push(["Website", data.website]);
  if (data.linkedinUrl) details.push(["LinkedIn", data.linkedinUrl]);
  if (data.portfolioUrl) details.push(["Portfolio", data.portfolioUrl]);
  if (data.salaryMin || data.salaryMax) {
    details.push(["Salary", `${data.salaryMin || "?"} – ${data.salaryMax || "?"}`]);
  }
  if (data.description) details.push(["Description", data.description.slice(0, 150) + "..."]);

  previewDetails.innerHTML = details.map(
    ([label, value]) => `<div class="detail-row"><span class="detail-label">${label}</span><span>${escHtml(value)}</span></div>`
  ).join("");

  // Skills
  if (data.skills?.length) {
    previewSkills.innerHTML = data.skills.map(
      (s) => `<span class="skill-tag">${escHtml(s)}</span>`
    ).join("");
  }

  // Work history
  if (data.workHistory?.length) {
    previewWork.classList.remove("hidden");
    previewWork.innerHTML = `<h4>Experience (${data.workHistory.length})</h4>` +
      data.workHistory.slice(0, 5).map((w) =>
        `<div class="work-item">
          <span class="work-title">${escHtml(w.title)}</span>
          <span class="work-company"> at ${escHtml(w.company)}</span>
          <div class="work-dates">${escHtml(w.startDate || "")} – ${escHtml(w.endDate || "Present")}</div>
        </div>`
      ).join("");
  }

  // Set import button label based on type
  importBtn.textContent = data.type === "candidate" ? "Import Candidate"
    : data.type === "client" ? "Import Client"
    : data.type === "job" ? "Import Job/REQ"
    : "Import";
}

// ── Duplicate checking ───────────────────────────────────────────────────────

async function checkDuplicates(data) {
  try {
    if (data.type === "candidate") {
      duplicates = await findDuplicateCandidates(config, data);
    } else if (data.type === "client") {
      duplicates = await findDuplicateCompanies(config, data);
    } else if (data.type === "contact") {
      duplicates = await findDuplicateContacts(config, data);
    } else {
      duplicates = [];
    }

    if (duplicates.length > 0) {
      dupSection.classList.remove("hidden");
      dupMessage.textContent = `${duplicates.length} possible duplicate${duplicates.length > 1 ? "s" : ""} found`;
      dupList.innerHTML = duplicates.map((d, i) =>
        `<div class="dup-item" data-idx="${i}">
          <div class="dup-name">${escHtml(d.first_name || d.name || "")} ${escHtml(d.last_name || "")}</div>
          <div class="dup-meta">${escHtml(d.email || d.website || "")} · ${escHtml(d.current_title || d.industry || "")}</div>
        </div>`
      ).join("");

      // Click to select a duplicate for merging
      dupList.querySelectorAll(".dup-item").forEach((el) => {
        el.addEventListener("click", () => {
          dupList.querySelectorAll(".dup-item").forEach((e) => e.style.borderColor = "#e5e7eb");
          el.style.borderColor = "#6366f1";
          selectedDup = duplicates[parseInt(el.dataset.idx)];
        });
      });

      // Auto-select first
      selectedDup = duplicates[0];
      dupList.querySelector(".dup-item").style.borderColor = "#6366f1";
    }
  } catch (err) {
    console.warn("Duplicate check failed:", err);
  }
}

// ── Import ───────────────────────────────────────────────────────────────────

importBtn.addEventListener("click", () => doImport(false));
importAnywayBtn.addEventListener("click", () => doImport(false));
mergeBtn.addEventListener("click", () => doImport(true));

async function doImport(merge) {
  if (!scrapedData) return;
  if (!agencyId) {
    const ok = await checkAuth();
    if (!ok) { showStatus("Not authenticated. Configure settings first.", "error"); return; }
  }

  setButtonsLoading(true);

  const userId = await getCurrentUserId(config);

  try {
    if (scrapedData.type === "candidate") {
      if (merge && selectedDup) {
        // Merge: update existing candidate with new fields
        const patch = mergeFields(selectedDup, {
          email: scrapedData.email,
          phone: scrapedData.phone,
          currentTitle: scrapedData.currentTitle,
          currentCompany: scrapedData.currentCompany,
          location: scrapedData.location,
          linkedinUrl: scrapedData.linkedinUrl,
          portfolioUrl: scrapedData.portfolioUrl,
          avatarUrl: scrapedData.avatarUrl,
          skills: scrapedData.skills,
        });
        // Map field names for the DB
        const dbPatch = {};
        if (patch.email) dbPatch.email = patch.email;
        if (patch.phone) dbPatch.phone = patch.phone;
        if (patch.currentTitle) dbPatch.currentTitle = patch.currentTitle;
        if (patch.currentCompany) dbPatch.currentCompany = patch.currentCompany;
        if (patch.location) dbPatch.location = patch.location;
        if (patch.linkedinUrl) dbPatch.linkedinUrl = patch.linkedinUrl;
        if (patch.portfolioUrl) dbPatch.portfolioUrl = patch.portfolioUrl;
        if (patch.avatarUrl) dbPatch.avatarUrl = patch.avatarUrl;
        if (patch.skills?.length) dbPatch.skills = patch.skills;

        await updateCandidate(config, selectedDup.id, dbPatch);
        // Also add new work history + education if any
        if (scrapedData.workHistory?.length) {
          await insertWorkHistory(config, agencyId, selectedDup.id, scrapedData.workHistory);
        }
        if (scrapedData.education?.length) {
          await insertEducation(config, agencyId, selectedDup.id, scrapedData.education);
        }
        // Log activity
        await logActivity(config, agencyId, userId, "candidate", selectedDup.id, "note",
          `Updated via Chrome extension (merged from ${scrapedData.source})`,
          { source: scrapedData.source, action: "merge" });
        importedCandidateId = selectedDup.id;
        showStatus(`Merged into existing candidate! Add to a pipeline below.`, "success");
        await showPostImportPanel();
      } else {
        // Insert new
        const result = await insertCandidate(config, agencyId, scrapedData);
        const candidateId = result?.[0]?.id;
        if (candidateId && scrapedData.workHistory?.length) {
          await insertWorkHistory(config, agencyId, candidateId, scrapedData.workHistory);
        }
        if (candidateId && scrapedData.education?.length) {
          await insertEducation(config, agencyId, candidateId, scrapedData.education);
        }
        // Log activity
        if (candidateId) {
          await logActivity(config, agencyId, userId, "candidate", candidateId, "note",
            `Imported via Chrome extension from ${scrapedData.source}`,
            { source: scrapedData.source, action: "import" });
        }
        importedCandidateId = candidateId || null;
        showStatus("Candidate imported! Add to a pipeline below.", "success");
        await showPostImportPanel();
      }
    } else if (scrapedData.type === "client") {
      if (merge && selectedDup) {
        const patch = mergeFields(selectedDup, {
          website: scrapedData.website,
          industry: scrapedData.industry,
          logoUrl: scrapedData.logoUrl,
        });
        await updateCompany(config, selectedDup.id, patch);
        await logActivity(config, agencyId, userId, "client", selectedDup.id, "note",
          `Updated via Chrome extension (merged from ${scrapedData.source})`,
          { source: scrapedData.source, action: "merge" });
        showStatus(`Merged into existing client: ${selectedDup.name}`, "success");
      } else {
        const result = await insertCompany(config, agencyId, scrapedData);
        const companyId = result?.[0]?.id;
        if (companyId) {
          await logActivity(config, agencyId, userId, "client", companyId, "note",
            `Imported via Chrome extension from ${scrapedData.source}`,
            { source: scrapedData.source, action: "import" });
        }
        showStatus("Client imported successfully!", "success");
      }
    } else if (scrapedData.type === "job") {
      const result = await insertJob(config, agencyId, scrapedData);
      const jobId = result?.[0]?.id;
      if (jobId) {
        await logActivity(config, agencyId, userId, "job", jobId, "note",
          `Imported via Chrome extension from ${scrapedData.source}`,
          { source: scrapedData.source, action: "import" });
      }
      showStatus("Job/REQ imported successfully!", "success");
    } else if (scrapedData.type === "contact") {
      if (merge && selectedDup) {
        const patch = mergeFields(selectedDup, {
          email: scrapedData.email,
          phone: scrapedData.phone,
          title: scrapedData.title,
          linkedinUrl: scrapedData.linkedinUrl,
        });
        await updateContact(config, selectedDup.id, patch);
        showStatus(`Merged into existing contact: ${selectedDup.first_name} ${selectedDup.last_name}`, "success");
      } else {
        await insertContact(config, agencyId, scrapedData);
        showStatus("Contact imported successfully!", "success");
      }
    }
  } catch (err) {
    showStatus(`Import failed: ${err.message}`, "error");
  } finally {
    setButtonsLoading(false);
  }
}

// ── Post-import action panel ─────────────────────────────────────────────────

async function showPostImportPanel() {
  if (!agencyId || !importedCandidateId) return;
  postImportPanel.classList.remove("hidden");

  // Load everything in parallel
  const [jobs, tags, hotlists, searchMatches] = await Promise.all([
    fetchActiveJobs(config, agencyId).catch(() => []),
    fetchTags(config, agencyId).catch(() => []),
    fetchHotlists(config, agencyId).catch(() => []),
    scrapedData ? matchSavedSearches(config, scrapedData).catch(() => []) : [],
  ]);

  // ── Tags section ──
  orgTags = tags || [];
  selectedTagIds = new Set();
  const candidateSkills = (scrapedData?.skills || []).map((s) => s.toLowerCase());

  tagChips.innerHTML = orgTags.map((t) => {
    const isMatch = candidateSkills.some((s) => t.name.toLowerCase().includes(s) || s.includes(t.name.toLowerCase()));
    if (isMatch) selectedTagIds.add(t.id);
    return `<span class="tag-chip ${isMatch ? "selected matched" : ""}" data-id="${t.id}" style="border-color:${t.color}">${escHtml(t.name)}</span>`;
  }).join("");

  // If there are scraped skills with no matching tags, show them as creatable
  const unmatchedSkills = (scrapedData?.skills || []).filter((s) =>
    !orgTags.some((t) => t.name.toLowerCase() === s.toLowerCase())
  );
  if (unmatchedSkills.length) {
    tagChips.innerHTML += unmatchedSkills.slice(0, 10).map((s) =>
      `<span class="tag-chip" data-create="${escHtml(s)}" style="border-style:dashed">${escHtml(s)} +</span>`
    ).join("");
  }

  // Toggle tag selection
  tagChips.querySelectorAll(".tag-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.dataset.id;
      const createName = chip.dataset.create;
      if (id) {
        if (selectedTagIds.has(id)) { selectedTagIds.delete(id); chip.classList.remove("selected"); }
        else { selectedTagIds.add(id); chip.classList.add("selected"); }
      } else if (createName) {
        // Create the tag, then select it
        chip.textContent = "...";
        createTag(config, agencyId, createName).then((result) => {
          const newTag = result?.[0];
          if (newTag) {
            orgTags.push(newTag);
            selectedTagIds.add(newTag.id);
            chip.dataset.id = newTag.id;
            delete chip.dataset.create;
            chip.textContent = createName;
            chip.style.borderStyle = "solid";
            chip.classList.add("selected");
          }
        }).catch(() => { chip.textContent = createName + " +"; });
      }
    });
  });

  // ── Pipeline section ──
  activeJobs = jobs || [];
  if (activeJobs.length) {
    jobPicker.innerHTML = '<option value="">— select a job —</option>' +
      activeJobs.map((j) =>
        `<option value="${j.id}">${escHtml(j.title)}${j.company_name ? ` · ${escHtml(j.company_name)}` : ""}</option>`
      ).join("");
  }

  // ── Hotlist section ──
  orgHotlists = hotlists || [];
  if (orgHotlists.length) {
    hotlistSection.style.display = "block";
    hotlistPicker.innerHTML = '<option value="">— select a hotlist —</option>' +
      orgHotlists.map((h) =>
        `<option value="${h.id}">${escHtml(h.name)} (${h.member_count || 0})</option>`
      ).join("");
  } else {
    // Still show section so they can create one
    hotlistSection.style.display = "block";
  }

  // ── Search match section ──
  if (searchMatches?.length) {
    searchMatchSection.style.display = "block";
    searchMatchList.innerHTML = searchMatches.map((m) =>
      `<div class="search-match-item" data-search-id="${m.id}">
        <div>
          <span class="search-match-name">${escHtml(m.name)}</span>
          <span class="search-match-score">${m.score} match signals</span>
        </div>
        <span class="search-match-added" style="display:none">Added</span>
      </div>`
    ).join("");
  }
}

// ── Tag actions ──

addTagBtn.addEventListener("click", async () => {
  const name = newTagInput.value.trim();
  if (!name || !agencyId) return;
  try {
    const result = await createTag(config, agencyId, name);
    const newTag = result?.[0];
    if (newTag) {
      orgTags.push(newTag);
      selectedTagIds.add(newTag.id);
      const chip = document.createElement("span");
      chip.className = "tag-chip selected";
      chip.dataset.id = newTag.id;
      chip.textContent = name;
      tagChips.appendChild(chip);
      chip.addEventListener("click", () => {
        if (selectedTagIds.has(newTag.id)) { selectedTagIds.delete(newTag.id); chip.classList.remove("selected"); }
        else { selectedTagIds.add(newTag.id); chip.classList.add("selected"); }
      });
      newTagInput.value = "";
    }
  } catch (err) { showStatus(`Tag creation failed: ${err.message}`, "error"); }
});

applyTagsBtn.addEventListener("click", async () => {
  if (!importedCandidateId || !selectedTagIds.size) return;
  applyTagsBtn.disabled = true;
  applyTagsBtn.innerHTML = '<span class="spinner"></span>Applying...';
  try {
    await tagCandidate(config, importedCandidateId, [...selectedTagIds]);
    showStatus(`${selectedTagIds.size} tag(s) applied!`, "success");
    applyTagsBtn.textContent = "Tags Applied";
  } catch (err) {
    showStatus(`Tag failed: ${err.message}`, "error");
    applyTagsBtn.textContent = "Apply Tags";
  } finally {
    applyTagsBtn.disabled = false;
  }
});

// ── Pipeline actions ──

addPipelineBtn.addEventListener("click", async () => {
  const jobId = jobPicker.value;
  if (!jobId) { showStatus("Select a job first.", "info"); return; }
  if (!importedCandidateId) { showStatus("No candidate to add.", "error"); return; }

  addPipelineBtn.disabled = true;
  addPipelineBtn.innerHTML = '<span class="spinner"></span>Adding...';

  try {
    await addToPipeline(config, agencyId, importedCandidateId, jobId);
    const userId = await getCurrentUserId(config);
    await logActivity(config, agencyId, userId, "candidate", importedCandidateId, "stage_change",
      `Added to pipeline via Chrome extension`,
      { source: "chrome_extension", job_id: jobId, stage: "Sourced" });
    const jobTitle = activeJobs.find((j) => j.id === jobId)?.title || "pipeline";
    showStatus(`Added to "${jobTitle}" as Sourced!`, "success");
    addPipelineBtn.textContent = "Added";
  } catch (err) {
    showStatus(`Pipeline add failed: ${err.message}`, "error");
    addPipelineBtn.textContent = "Add to Pipeline";
  } finally {
    addPipelineBtn.disabled = false;
  }
});

// ── Hotlist actions ──

createHotlistBtn.addEventListener("click", async () => {
  const name = newHotlistInput.value.trim();
  if (!name || !agencyId) return;
  try {
    const result = await createHotlist(config, agencyId, name);
    const hl = result?.[0];
    if (hl) {
      orgHotlists.push(hl);
      const opt = document.createElement("option");
      opt.value = hl.id;
      opt.textContent = `${name} (0)`;
      hotlistPicker.appendChild(opt);
      hotlistPicker.value = hl.id;
      newHotlistInput.value = "";
    }
  } catch (err) { showStatus(`Hotlist creation failed: ${err.message}`, "error"); }
});

addHotlistBtn.addEventListener("click", async () => {
  const hlId = hotlistPicker.value;
  if (!hlId || !importedCandidateId) { showStatus("Select a hotlist first.", "info"); return; }
  addHotlistBtn.disabled = true;
  try {
    await addToHotlist(config, agencyId, importedCandidateId, hlId);
    const hlName = orgHotlists.find((h) => h.id === hlId)?.name || "hotlist";
    showStatus(`Added to "${hlName}" hotlist!`, "success");
    addHotlistBtn.textContent = "Added";
  } catch (err) {
    showStatus(`Hotlist add failed: ${err.message}`, "error");
  } finally {
    addHotlistBtn.disabled = false;
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetUI() {
  previewCard.classList.add("hidden");
  dupSection.classList.add("hidden");
  actionRow.classList.add("hidden");
  statusMsg.classList.add("hidden");
  postImportPanel.classList.add("hidden");
  previewSkills.innerHTML = "";
  previewWork.classList.add("hidden");
  duplicates = [];
  selectedDup = null;
  scrapedData = null;
  importedCandidateId = null;
  selectedTagIds = new Set();
  searchMatchSection.style.display = "none";
  hotlistSection.style.display = "none";
}

function showStatus(msg, type = "info") {
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg ${type}`;
  statusMsg.classList.remove("hidden");
}

function setButtonsLoading(loading) {
  [importBtn, mergeBtn, importAnywayBtn].forEach((btn) => {
    btn.disabled = loading;
  });
  if (loading) {
    importBtn.innerHTML = '<span class="spinner"></span>Importing...';
  } else {
    importBtn.textContent = scrapedData?.type === "candidate" ? "Import Candidate"
      : scrapedData?.type === "client" ? "Import Client"
      : "Import";
  }
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
init();
