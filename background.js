// Default: automatic archive fetching enabled
let autoFetch = true;
// Store archive results per tab
let archiveResults = {};

// Function to update the browser action badge text for a given tab
function updateBadge(tabId, resultsCount) {
  browser.browserAction.setBadgeText({ tabId: tabId, text: resultsCount.toString() });
}

// Fetch from web.archive.org using the CDX API
function fetchWebArchive(url) {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&collapse=digest&output=json`;
  return fetch(cdxUrl)
    .then(response => response.json())
    .then(data => {
      // Data is an array; first element is the header row
      if (data && data.length > 1) {
        // Header row: ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]
        let entries = data.slice(1);
        // Map each entry to an object
        let results = entries.map(entry => ({
          service: "web.archive.org",
          // Construct a URL that shows the archived snapshot
          url: `https://web.archive.org/web/${entry[1]}/${entry[2]}`,
          // Use the timestamp for sorting; same field can be used as date
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

// Dummy fetch for archive.today
function fetchArchiveToday(url) {
  // Archive.today does not provide a documented API.
  // For demonstration, we fetch the search page and do a basic check.
  return fetch(`https://archive.today/search/?q=${encodeURIComponent(url)}`)
    .then(response => response.text())
    .then(html => {
      // A real implementation would parse the HTML properly.
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
      console.error("Error fetching from archive.today:", error);
      return null;
    });
}

// Query both archive services for the current page URL.
// Note: We now expect fetchWebArchive to return an array of results.
function fetchArchives(tabId, url) {
  if (!autoFetch) {
    archiveResults[tabId] = [];
    updateBadge(tabId, 0);
    return;
  }
  Promise.all([fetchWebArchive(url), fetchArchiveToday(url)]).then(results => {
    // results[0] is an array from the CDX API, results[1] may be an object (or null)
    let cdXResults = results[0] || [];
    let archiveTodayResult = results[1] ? [results[1]] : [];
    let validResults = cdXResults.concat(archiveTodayResult);
    // Save results for this tab
    archiveResults[tabId] = validResults;
    // Update badge with number of results
    updateBadge(tabId, validResults.length);
  });
}

// Listen for updates on tabs
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // When the tab finishes loading and it's not an internal page
  if (changeInfo.status === "complete" && tab.active && tab.url && !tab.url.startsWith("about:")) {
    fetchArchives(tabId, tab.url);
  }
});

// Listen for messages from the popup (to get results or update autoFetch setting)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getResults") {
    // If sender.tab is undefined, query for the active tab
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
      // Return true to indicate async response
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

