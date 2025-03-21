// Default: automatic archive fetching enabled
let autoFetch = true;
// Store archive results per tab
let archiveResults = {};

// Update badge text for the given tab
function updateBadge(tabId, resultsCount) {
  const text = resultsCount > 100 ? "99+" : resultsCount.toString();
  browser.browserAction.setBadgeText({ tabId: tabId, text: text });
}

// Fetch from web.archive.org using the CDX API
function fetchWebArchive(url) {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&collapse=digest&output=json`;
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
        return results;
      } else {
        return [];
      }
    })
    .catch(error => {
      console.error("Error fetching from CDX API:", error);
      return [];
    });
}

// Query the archive service for the current page URL
function fetchArchives(tabId, url) {
  if (!autoFetch) {
    archiveResults[tabId] = [];
    updateBadge(tabId, 0);
    return;
  }
  fetchWebArchive(url).then(results => {
    archiveResults[tabId] = results;
    updateBadge(tabId, results.length);
  });
}

// Listen for updates on tabs
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url && !tab.url.startsWith("about:")) {
    fetchArchives(tabId, tab.url);
  }
});

// Listen for messages from the popup (to get results or update autoFetch setting)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getResults") {
    if (!sender.tab || !sender.tab.id) {
      browser.tabs.query({ active: true, currentWindow: true })
        .then(tabs => {
          let tabId = tabs[0].id;
          sendResponse({ results: archiveResults[tabId] || [] });
        })
        .catch(error => {
          console.error("Error querying active tab:", error);
          sendResponse({ results: [] });
        });
      return true;
    } else {
      let tabId = sender.tab.id;
      sendResponse({ results: archiveResults[tabId] || [] });
    }
  } else if (message.action === "setAutoFetch") {
    autoFetch = message.value;
    browser.storage.local.set({ autoFetch: autoFetch });
    sendResponse({ status: "ok" });
  }
});

// Update the browser action icon based on dark/light mode
function updateIcon() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    browser.browserAction.setIcon({ path: "icons/history_white.png" });
  } else {
    browser.browserAction.setIcon({ path: "icons/history.png" });
  }
}

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateIcon);
}
updateIcon();

