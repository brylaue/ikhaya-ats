/**
 * Background service worker.
 * Lightweight relay between popup ↔ content scripts.
 * Handles image fetching (to avoid CORS in content scripts).
 */

// US-362: message schema + sender validation.
// Without these checks any extension or web page able to `sendMessage` to our
// service worker could invoke `fetchImage` against an arbitrary URL (SSRF-ish)
// or trigger scrapes on the active tab.
// A valid message must:
//   - come from THIS extension (sender.id === chrome.runtime.id), and
//   - either have no tab (popup) or a tab whose url matches one of our
//     allowlisted content-script origins (LinkedIn / GitHub).
const ALLOWED_ACTIONS = new Set(["fetchImage", "scrapeActiveTab"]);
const ALLOWED_CONTENT_ORIGINS = [
  /^https:\/\/(www\.)?linkedin\.com(\/|$)/,
  /^https:\/\/github\.com(\/|$)/,
];

function isValidSender(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  // Popup messages have no tab — trust them (they originated in our UI).
  if (!sender.tab) return true;
  const url = sender.tab.url || sender.url || "";
  return ALLOWED_CONTENT_ORIGINS.some((re) => re.test(url));
}

function isValidMessage(msg) {
  if (!msg || typeof msg !== "object") return false;
  if (!ALLOWED_ACTIONS.has(msg.action)) return false;
  if (msg.action === "fetchImage") {
    if (typeof msg.url !== "string" || msg.url.length > 2048) return false;
    try {
      const parsed = new URL(msg.url);
      if (parsed.protocol !== "https:") return false;
    } catch { return false; }
  }
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) {
    sendResponse({ ok: false, error: "Unauthorized sender" });
    return false;
  }
  if (!isValidMessage(msg)) {
    sendResponse({ ok: false, error: "Invalid message" });
    return false;
  }

  // Proxy image download — fetches image URL and returns base64
  // US-366: validate MIME type + size before handing the data URL back.
  // SVG explicitly rejected — it can execute scripts when rendered inline.
  if (msg.action === "fetchImage") {
    const ALLOWED_MIME = new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
    ]);
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

    fetch(msg.url, { mode: "cors", credentials: "omit" })
      .then((res) => {
        const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        if (!ALLOWED_MIME.has(ct)) {
          throw new Error(`Unsupported image type: ${ct || "unknown"}`);
        }
        return res.blob();
      })
      .then((blob) => {
        // Double-check against Blob.type (some servers lie in Content-Type)
        const blobType = (blob.type || "").toLowerCase();
        if (!ALLOWED_MIME.has(blobType)) {
          throw new Error(`Unsupported image type: ${blobType || "unknown"}`);
        }
        if (blob.size > MAX_BYTES) {
          throw new Error(`Image too large (${blob.size} bytes)`);
        }
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ ok: true, dataUrl: reader.result });
        reader.onerror   = () => sendResponse({ ok: false, error: "Failed to decode image" });
        reader.readAsDataURL(blob);
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Relay scrape request to the active tab's content script
  if (msg.action === "scrapeActiveTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "scrape" }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: "Content script not loaded on this page. Navigate to a LinkedIn or GitHub page." });
        } else {
          sendResponse(response);
        }
      });
    });
    return true;
  }
});
