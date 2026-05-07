/**
 * LinkedIn content script — scrapes profile, company, and job pages.
 * Injects zero UI; responds to messages from the popup/background.
 */

(() => {
  "use strict";

  // ── Utilities ────────────────────────────────────────────────────────────────

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const txt = (sel, root) => qs(sel, root)?.innerText?.trim() || "";

  function detectPageType() {
    const path = location.pathname;
    if (path.startsWith("/in/")) return "profile";
    if (path.startsWith("/company/") && path.includes("/jobs")) return "company_jobs";
    if (path.startsWith("/company/")) return "company";
    if (path.startsWith("/jobs/view/") || path.startsWith("/jobs/collections/")) return "job";
    return "unknown";
  }

  // ── Profile scraper ──────────────────────────────────────────────────────────

  function scrapeProfile() {
    const main = qs("main") || document;

    // Name
    const fullName = txt("h1", main);
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ");

    // Headline & current position
    const headline = txt(".text-body-medium", main);

    // Current title + company (from experience or headline)
    let currentTitle = "";
    let currentCompany = "";
    const topCard = qs(".pv-text-details__right-panel") || main;
    const subLine = txt(".text-body-medium", topCard);
    if (subLine) {
      // Usually "Title at Company"
      const atMatch = subLine.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atMatch) {
        currentTitle = atMatch[1].trim();
        currentCompany = atMatch[2].trim();
      } else {
        currentTitle = subLine;
      }
    }

    // Location
    const location = txt(".text-body-small.inline.t-black--light.break-words", main)
      || txt("[class*='top-card'] .top-card__subline-item", main)
      || "";

    // Avatar
    const avatarEl = qs("img.pv-top-card-profile-picture__image--show", main)
      || qs("img.profile-photo-edit__preview", main)
      || qs(".pv-top-card__photo img", main);
    const avatarUrl = avatarEl?.src || "";

    // LinkedIn URL (use window.location — `location` above is the city string)
    const linkedinUrl = window.location.href.split("?")[0];

    // Contact info (if the section is expanded)
    let email = "";
    let phone = "";
    const contactSection = qs(".pv-contact-info");
    if (contactSection) {
      const emailEl = qs("a[href^='mailto:']", contactSection);
      email = emailEl?.href?.replace("mailto:", "") || "";
      const phoneEl = qs(".t-14.t-black.t-normal", contactSection);
      phone = phoneEl?.innerText?.trim() || "";
    }

    // Experience (work history)
    const workHistory = [];
    const expItems = qsa("#experience ~ .pvs-list__outer-container li.artdeco-list__item")
      .concat(qsa("[id='experience'] ~ div li.artdeco-list__item"));

    for (const item of expItems.slice(0, 10)) {
      const title = txt(".t-bold span[aria-hidden='true']", item);
      const companyLine = txt(".t-normal span[aria-hidden='true']", item);
      const company = companyLine?.split("·")[0]?.trim() || "";
      const dateLine = txt(".pvs-entity__caption-wrapper", item)
        || txt(".t-black--light span[aria-hidden='true']", item);
      const loc = txt(".t-black--light:last-child span[aria-hidden='true']", item);

      let startDate = "";
      let endDate = "";
      if (dateLine) {
        const parts = dateLine.split("–").map((s) => s.trim());
        startDate = parts[0] || "";
        endDate = parts[1]?.includes("Present") ? "" : parts[1] || "";
      }

      if (title || company) {
        workHistory.push({ title, company, startDate, endDate, location: loc });
      }
    }

    // Education
    const education = [];
    const eduItems = qsa("#education ~ .pvs-list__outer-container li.artdeco-list__item")
      .concat(qsa("[id='education'] ~ div li.artdeco-list__item"));

    for (const item of eduItems.slice(0, 5)) {
      const school = txt(".t-bold span[aria-hidden='true']", item);
      const degreeLine = txt(".t-normal span[aria-hidden='true']", item);
      const dateLine = txt(".pvs-entity__caption-wrapper", item)
        || txt(".t-black--light span[aria-hidden='true']", item);

      let degree = "";
      let field = "";
      if (degreeLine) {
        const parts = degreeLine.split(",").map((s) => s.trim());
        degree = parts[0] || "";
        field = parts.slice(1).join(", ") || "";
      }

      let gradYear = "";
      if (dateLine) {
        const yearMatch = dateLine.match(/(\d{4})\s*$/);
        gradYear = yearMatch ? yearMatch[1] : "";
      }

      if (school) {
        education.push({ school, degree, field, gradYear });
      }
    }

    // Skills
    const skills = qsa("[id='skills'] ~ div .t-bold span[aria-hidden='true']")
      .map((el) => el.innerText.trim())
      .filter(Boolean)
      .slice(0, 30);

    return {
      type: "candidate",
      source: "linkedin",
      firstName,
      lastName,
      email,
      phone,
      currentTitle: currentTitle || headline,
      currentCompany,
      location,
      avatarUrl,
      linkedinUrl,
      skills,
      workHistory,
      education,
    };
  }

  // ── Company scraper ──────────────────────────────────────────────────────────

  function scrapeCompany() {
    const main = qs("main") || document;
    const name = txt("h1", main) || txt(".org-top-card-summary__title", main);
    const industry = txt(".org-top-card-summary-info-list__info-item", main);
    const sizeEl = qsa(".org-top-card-summary-info-list__info-item", main);
    const size = sizeEl?.[1]?.innerText?.trim() || "";
    const website = qs("a[data-control-name='top_card_website']", main)?.href
      || txt(".org-about-us-organization-description .link-without-visited-state", main)
      || "";
    const logoEl = qs(".org-top-card-primary-content__logo", main)
      || qs("img.org-top-card-primary-content__logo", main);
    const logoUrl = logoEl?.src || "";

    return {
      type: "client",
      source: "linkedin",
      name,
      industry,
      size,
      website,
      logoUrl,
      linkedinUrl: window.location.href.split("?")[0],
    };
  }

  // ── Job scraper ──────────────────────────────────────────────────────────────

  function scrapeJob() {
    const main = qs("main") || document;
    const title = txt(".job-details-jobs-unified-top-card__job-title h1", main)
      || txt("h1", main);
    const companyName = txt(".job-details-jobs-unified-top-card__company-name", main)
      || txt(".topcard__org-name-link", main);
    const location = txt(".job-details-jobs-unified-top-card__bullet", main)
      || txt(".topcard__flavor--bullet", main);
    const description = txt(".jobs-description__content", main)
      || txt(".description__text", main);

    // Try to extract salary
    let salaryMin = null;
    let salaryMax = null;
    const salaryText = txt(".job-details-jobs-unified-top-card__job-insight span", main);
    if (salaryText) {
      const nums = salaryText.match(/[\$\£\€]?([\d,]+)/g)?.map((n) =>
        parseInt(n.replace(/[^\d]/g, ""))
      );
      if (nums?.length >= 2) {
        salaryMin = nums[0];
        salaryMax = nums[1];
      }
    }

    // Employment type
    let employmentType = "full_time";
    const typeText = qsa(".job-details-jobs-unified-top-card__job-insight span", main)
      .map((el) => el.innerText.toLowerCase())
      .find((t) => t.includes("contract") || t.includes("part-time") || t.includes("temporary"));
    if (typeText?.includes("contract")) employmentType = "contract";
    if (typeText?.includes("part-time")) employmentType = "part_time";

    // Remote
    let remotePolicy = "onsite";
    const remoteBadge = qsa(".job-details-jobs-unified-top-card__workplace-type", main)
      .map((el) => el.innerText.toLowerCase());
    if (remoteBadge.some((t) => t.includes("remote"))) remotePolicy = "remote";
    if (remoteBadge.some((t) => t.includes("hybrid"))) remotePolicy = "hybrid";

    return {
      type: "job",
      source: "linkedin",
      title,
      companyName,
      location,
      description: description?.slice(0, 5000),
      salaryMin,
      salaryMax,
      employmentType,
      remotePolicy,
    };
  }

  // ── Message handler ──────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "scrape") {
      try {
        const pageType = detectPageType();
        let data = null;

        switch (pageType) {
          case "profile":
            data = scrapeProfile();
            break;
          case "company":
            data = scrapeCompany();
            break;
          case "job":
          case "company_jobs":
            data = scrapeJob();
            break;
          default:
            data = { type: "unknown", source: "linkedin", error: "Unsupported LinkedIn page" };
        }

        sendResponse({ ok: true, data, pageType });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    }

    if (msg.action === "ping") {
      sendResponse({ ok: true, site: "linkedin", pageType: detectPageType() });
    }

    return true; // keep channel open for async
  });
})();
