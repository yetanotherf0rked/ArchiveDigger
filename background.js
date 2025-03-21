// background.js
// Default: automatic archive fetching enabled
let autoFetch = true;
// Store archive results per tab
let archiveResults = {};

// Simple logging function for background tasks.
function log(message) {
  console.log("[Background] " + message);
}

// Update badge text for the given tab
function updateBadge(tabId, resultsCount) {
  const text = resultsCount > 100 ? "99+" : resultsCount.toString();
  browser.browserAction.setBadgeText({ tabId: tabId, text: text });
  log(`Updated badge for tab ${tabId} with text: ${text}`);
}

// Fetch from web.archive.org using the CDX API
function fetchWebArchive(url) {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&collapse=digest&output=json`;
  log("Fetching archive data from: " + cdxUrl);
  return fetch(cdxUrl)
    .then(response => response.json())
    .then(data => {
      if (data && data.length > 1) {
        // Header: ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]
        let entries = data.slice(1);
        let results = entries.map(entry => ({
          service: "web.archive.org",
          url: `https://web.archive.org/web/${entry[1]}/${entry[2]}`,
          date: entry[1],
          mimetype: entry[3],
          statuscode: entry[4],
          digest: entry[5],
          length: entry[6]
        }));
        log(`Fetched ${results.length} archive entries for ${url}`);
        return results;
      } else {
        log("No archive entries found for " + url);
        return [];
      }
    })
    .catch(error => {
      log("Error fetching from CDX API: " + error.message);
      return [];
    });
}

// Query the archive service for the current page URL
function fetchArchives(tabId, url) {
  if (!autoFetch) {
    archiveResults[tabId] = [];
    updateBadge(tabId, 0);
    log("AutoFetch disabled. Archive results cleared for tab " + tabId);
    return;
  }
  fetchWebArchive(url).then(results => {
    archiveResults[tabId] = results;
    updateBadge(tabId, results.length);
    log("Stored archive results for tab " + tabId);
  });
}

// Listen for updates on tabs
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url && !tab.url.startsWith("about:")) {
    log(`Tab ${tabId} updated; fetching archives for URL: ${tab.url}`);
    fetchArchives(tabId, tab.url);
  }
});

// Listen for messages from the popup and diff page.
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getResults") {
    if (!sender.tab || !sender.tab.id) {
      browser.tabs.query({ active: true, currentWindow: true })
        .then(tabs => {
          let tabId = tabs[0].id;
          sendResponse({ results: archiveResults[tabId] || [] });
          log("Sent archive results for active tab " + tabId);
        })
        .catch(error => {
          log("Error querying active tab: " + error.message);
          sendResponse({ results: [] });
        });
      return true;
    } else {
      let tabId = sender.tab.id;
      sendResponse({ results: archiveResults[tabId] || [] });
      log("Sent archive results for tab " + tabId);
    }
  } else if (message.action === "setAutoFetch") {
    autoFetch = message.value;
    browser.storage.local.set({ autoFetch: autoFetch });
    log("AutoFetch setting updated to: " + autoFetch);
    sendResponse({ status: "ok" });
  } else if (message.action === "getOriginalContent") {
    // New handler: get content of the original page via content script.
    let tabId = message.tabId;
    browser.tabs.executeScript(tabId, { file: "content.js" })
      .then(results => {
        log("Retrieved original content from tab " + tabId);
        sendResponse(results[0] || "");
      })
      .catch(error => {
        log("Error executing content script on tab " + tabId + ": " + error.message);
        sendResponse("");
      });
    return true; // Inform runtime that we'll send a response asynchronously.
  }
});

// Update the browser action icon based on dark/light mode
function updateIcon() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    browser.browserAction.setIcon({ path: "icons/history_white.png" });
    log("Set dark mode icon");
  } else {
    browser.browserAction.setIcon({ path: "icons/history.png" });
    log("Set light mode icon");
  }
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateIcon);
}
updateIcon();

