// Default: automatic archive fetching enabled
let autoFetch = true;
// Store archive results per tab
let archiveResults = {};

// Function to update the browser action badge text for a given tab
function updateBadge(tabId, resultsCount) {
  browser.browserAction.setBadgeText({ tabId: tabId, text: resultsCount.toString() });
}

// Fetch from web.archive.org using their availability API
function fetchWebArchive(url) {
  return fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`)
    .then(response => response.json())
    .then(data => {
      if (data.archived_snapshots && data.archived_snapshots.closest) {
        let snapshot = data.archived_snapshots.closest;
        return {
          service: "web.archive.org",
          url: snapshot.url,
          date: snapshot.timestamp
        };
      } else {
        return null;
      }
    })
    .catch(error => {
      console.error("Error fetching web.archive.org", error);
      return null;
    });
}

// Dummy fetch for archive.today
function fetchArchiveToday(url) {
  // Archive.today does not provide a documented API.
  // For demonstration purposes, we fetch the search page and do a basic check.
  return fetch(`https://archive.today/search/?q=${encodeURIComponent(url)}`)
    .then(response => response.text())
    .then(html => {
      // A real implementation would parse the HTML properly.
      // Here we simply simulate a found archive entry if the URL appears in the HTML.
      if (html.includes(url)) {
        // Using a placeholder timestamp
        let fakeDate = "20210101120000";
        return {
          service: "archive.today",
          url: `https://archive.today/${encodeURIComponent(url)}`,
          date: fakeDate
        };
      } else {
        return null;
      }
    })
    .catch(error => {
      console.error("Error fetching archive.today", error);
      return null;
    });
}

// Query both archive services for the current page URL
function fetchArchives(tabId, url) {
  if (!autoFetch) {
    archiveResults[tabId] = [];
    updateBadge(tabId, 0);
    return;
  }
  Promise.all([fetchWebArchive(url), fetchArchiveToday(url)]).then(results => {
    // Filter out null results
    let validResults = results.filter(res => res !== null);
    // Save results for this tab
    archiveResults[tabId] = validResults;
    // Update badge with number of results
    updateBadge(tabId, validResults.length);
  });
}

// Listen for updates on tabs
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // When the tab finishes loading, and it's not an internal page (like about:)
  if (changeInfo.status === "complete" && tab.active && tab.url && !tab.url.startsWith("about:")) {
    fetchArchives(tabId, tab.url);
  }
});

// Listen for messages from the popup (to get results or update autoFetch setting)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getResults") {
    let tabId = sender.tab.id;
    sendResponse({ results: archiveResults[tabId] || [] });
  } else if (message.action === "setAutoFetch") {
    autoFetch = message.value;
    browser.storage.local.set({ autoFetch: autoFetch });
    sendResponse({ status: "ok" });
  }
});

