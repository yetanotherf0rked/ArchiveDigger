document.addEventListener('DOMContentLoaded', () => {
  let autoFetchCheckbox = document.getElementById('autoFetchCheckbox');

  // Retrieve the saved autoFetch setting (if any)
  browser.storage.local.get('autoFetch').then(data => {
    if (data.autoFetch === false) {
      autoFetchCheckbox.checked = false;
    }
  });

  // Update autoFetch setting when checkbox value changes
  autoFetchCheckbox.addEventListener('change', () => {
    let value = autoFetchCheckbox.checked;
    browser.runtime.sendMessage({ action: "setAutoFetch", value: value });
  });

  // Request archive results for the current tab from the background script
  browser.runtime.sendMessage({ action: "getResults" }).then(response => {
    let results = response.results;
    let container = document.getElementById('resultsContainer');

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
  });
});

