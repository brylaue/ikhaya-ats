/**
 * GitHub content script — scrapes user profiles and org pages.
 */

(() => {
  "use strict";

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const txt = (sel, root) => qs(sel, root)?.innerText?.trim() || "";

  function detectPageType() {
    const path = location.pathname;
    const segs = path.split("/").filter(Boolean);
    if (segs.length === 1) {
      // Could be user or org
      const tabNav = qs("nav[aria-label='User profile']") || qs(".UnderlineNav-body");
      if (qs(".h-card") || qs("[itemprop='name']")) return "profile";
      if (qs(".orghead") || qs("[data-hovercard-type='organization']")) return "org";
      return "profile"; // default guess for /<username>
    }
    return "unknown";
  }

  // ── Profile scraper ──────────────────────────────────────────────────────────

  function scrapeProfile() {
    const sidebar = qs(".h-card") || qs("[itemtype='http://schema.org/Person']") || document;

    const fullName = txt("[itemprop='name']", sidebar)
      || txt(".p-name.vcard-fullname", sidebar)
      || txt(".vcard-names .p-name");
    const username = txt("[itemprop='additionalName']", sidebar)
      || txt(".p-nickname.vcard-username", sidebar)
      || location.pathname.split("/").filter(Boolean)[0] || "";

    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ");

    // Bio
    const bio = txt(".p-note [data-bio-text]", sidebar)
      || txt(".p-note .js-user-profile-bio-contents", sidebar)
      || txt("[data-bio-text]");

    // Company
    const currentCompany = txt("[itemprop='worksFor']", sidebar)
      || txt(".p-org", sidebar)
      || "";

    // Location
    const location_ = txt("[itemprop='homeLocation']", sidebar)
      || txt(".p-label", sidebar)
      || "";

    // Website / portfolio
    const websiteEl = qs("[itemprop='url'] a", sidebar)
      || qs(".p-label a[rel='nofollow me']", sidebar);
    const portfolioUrl = websiteEl?.href || "";

    // Email (sometimes visible)
    const emailEl = qs("[itemprop='email'] a", sidebar);
    const email = emailEl?.innerText?.trim() || "";

    // Avatar
    const avatarEl = qs("img.avatar-user", sidebar)
      || qs("img[alt*='avatar']", sidebar)
      || qs(".avatar img");
    const avatarUrl = avatarEl?.src?.replace(/\?.*/, "?s=400") || "";

    // Social links
    const socialLinks = qsa(".vcard-details li a, [itemprop='social'] a", sidebar)
      .map((a) => a.href)
      .filter(Boolean);
    const linkedinUrl = socialLinks.find((u) => u.includes("linkedin.com")) || "";
    const twitterUrl = socialLinks.find((u) => u.includes("twitter.com") || u.includes("x.com")) || "";

    // Pinned repos as "skills" signal
    const pinnedRepos = qsa(".pinned-item-list-item .repo").map((el) => el.innerText.trim());

    // Language stats from contribution area
    const languages = qsa("[data-repository-hovercards-enabled] [itemprop='programmingLanguage']")
      .map((el) => el.innerText.trim())
      .filter(Boolean);

    // Popular repo languages (from overview)
    const repoLangs = qsa(".repo-language-color + span, [itemprop='programmingLanguage']")
      .map((el) => el.innerText.trim())
      .filter(Boolean);

    const allSkills = [...new Set([...languages, ...repoLangs])].slice(0, 20);

    // Contribution count
    const contribText = txt(".js-yearly-contributions h2") || "";
    const contribMatch = contribText.match(/([\d,]+)/);
    const contributions = contribMatch ? parseInt(contribMatch[1].replace(",", "")) : 0;

    return {
      type: "candidate",
      source: "github",
      firstName: firstName || username,
      lastName,
      email,
      currentTitle: bio?.slice(0, 100) || "",
      currentCompany: currentCompany.replace("@", ""),
      location: location_,
      avatarUrl,
      linkedinUrl,
      portfolioUrl: portfolioUrl || `https://github.com/${username}`,
      skills: allSkills,
      workHistory: [],
      meta: {
        githubUsername: username,
        bio,
        twitterUrl,
        pinnedRepos,
        contributions,
      },
    };
  }

  // ── Org scraper ────────────────────────────────────────────────────────────

  function scrapeOrg() {
    const name = txt("h1.h2") || txt(".org-name") || txt("h1");
    const description = txt(".organization-bio p") || txt("[itemprop='description']") || "";
    const websiteEl = qs("[data-hovercard-type='organization'] a[href]")
      || qs(".orghead a[rel='nofollow']");
    const website = websiteEl?.href || "";
    const locationText = txt("[itemprop='location']") || "";
    const logoEl = qs("img.avatar-group-item") || qs("img.avatar");
    const logoUrl = logoEl?.src?.replace(/\?.*/, "?s=200") || "";

    return {
      type: "client",
      source: "github",
      name,
      industry: "Technology",
      website,
      logoUrl,
      location: locationText,
      meta: { description },
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
          case "org":
            data = scrapeOrg();
            break;
          default:
            data = { type: "unknown", source: "github", error: "Unsupported GitHub page" };
        }

        sendResponse({ ok: true, data, pageType });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    }

    if (msg.action === "ping") {
      sendResponse({ ok: true, site: "github", pageType: detectPageType() });
    }

    return true;
  });
})();
