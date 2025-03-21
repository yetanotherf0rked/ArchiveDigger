document.addEventListener('DOMContentLoaded', () => {
  let autoFetchCheckbox = document.getElementById('autoFetchCheckbox');
  let debugContainer = document.getElementById('debugContainer');

  // Retrieve the saved autoFetch setting (if any)
  browser.storage.local.get('autoFetch')
    .then(data => {
      if (data.autoFetch === false) {
        autoFetchCheckbox.checked = false;
        debugContainer.innerText += "autoFetch setting loaded: false\n";
      } else {
        debugContainer.innerText += "autoFetch setting loaded: true\n";
      }
    })
    .catch(error => {
      console.error("Error retrieving autoFetch setting:", error);
      debugContainer.innerText += "Error retrieving autoFetch setting: " + error.message + "\n";
    });

  // Update autoFetch setting when checkbox value changes
  autoFetchCheckbox.addEventListener('change', () => {
    let value = autoFetchCheckbox.checked;
    browser.runtime.sendMessage({ action: "setAutoFetch", value: value })
      .then(response => {
        debugContainer.innerText += "AutoFetch setting updated successfully.\n";
      })
      .catch(error => {
        console.error("Error setting autoFetch:", error);
        debugContainer.innerText += "Error setting autoFetch: " + error.message + "\n";
      });
  });

  // Request archive results for the current tab from the background script
  browser.runtime.sendMessage({ action: "getResults" })
    .then(response => {
      let container = document.getElementById('resultsContainer');
      if (!response || typeof response.results === "undefined") {
        container.innerText = "Error: No results field in response.";
        debugContainer.innerText += "Error: No results field in response.\n";
        return;
      }
      let results = response.results;
      debugContainer.innerText += "Received results: " + JSON.stringify(results) + "\n";

      if (results.length > 0) {
        // Sort results by date (assuming YYYYMMDDhhmmss format)
        results.sort((a, b) => a.date.localeCompare(b.date));
        results.forEach(result => {
          let div = document.createElement('div');
          div.className = "result";
          div.innerHTML = `<span class="service">${result.service}</span> - <span class="date">${result.date}</span> - <a href="${result.url}" target="_blank">View Archive</a>`;
          container.appendChild(div);
        });
      } else {
        container.innerText = "No archives found.";
      }
    })
    .catch(error => {
      let container = document.getElementById('resultsContainer');
      container.innerText = "Error fetching results: " + error.message;
      debugContainer.innerText += "Error fetching results: " + error.message + "\n";
      console.error("Error fetching results:", error);
    });
});

