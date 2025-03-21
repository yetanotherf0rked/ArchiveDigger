document.addEventListener('DOMContentLoaded', () => {
  const autoFetchCheckbox = document.getElementById('autoFetchCheckbox');
  const resultsCountEl = document.getElementById('resultsCount');
  const tableBody = document.querySelector('#resultsTable tbody');
  const debugContainer = document.getElementById('debugContainer');
  const toggleLogs = document.getElementById('toggleLogs');
  const resultsInfo = document.getElementById('resultsInfo');
  
  let archiveResults = [];
  let displayAll = false; // flag for showing all results

  // Toggle logs display using clickable text with symbols ▸ and ▾
  toggleLogs.addEventListener('click', () => {
    if (debugContainer.style.display === 'none') {
      debugContainer.style.display = 'block';
      toggleLogs.innerText = '▾ Hide Logs';
    } else {
      debugContainer.style.display = 'none';
      toggleLogs.innerText = '▸ Show Logs';
    }
  });
  
  // Log messages only if logs are visible
  function log(message) {
    if (debugContainer.style.display !== 'none') {
      debugContainer.innerText += message + "\n";
    }
  }
  
  // Load autoFetch setting from storage
  browser.storage.local.get('autoFetch')
    .then(data => {
      if (data.autoFetch === false) {
        autoFetchCheckbox.checked = false;
        log("autoFetch setting loaded: false");
      } else {
        log("autoFetch setting loaded: true");
      }
    })
    .catch(error => {
      log("Error retrieving autoFetch setting: " + error.message);
    });
  
  // Update autoFetch setting when checkbox value changes
  autoFetchCheckbox.addEventListener('change', () => {
    const value = autoFetchCheckbox.checked;
    browser.runtime.sendMessage({ action: "setAutoFetch", value: value })
      .then(() => {
        log("AutoFetch setting updated successfully.");
      })
      .catch(error => {
        log("Error setting autoFetch: " + error.message);
      });
  });
  
  // Function to render the results table
  function renderTable(data) {
    tableBody.innerHTML = "";
    let displayData = data;
    if (!displayAll && data.length > 10) {
      displayData = data.slice(0, 5).concat([{ ellipsis: true }], data.slice(-5));
      resultsInfo.innerHTML = 'Displaying 5 oldest and 5 latest results.\n<span id="showAllLink" style="cursor:pointer; text-decoration:underline;">Show All</span>';
      const showAllLink = document.getElementById('showAllLink');
      showAllLink.addEventListener('click', () => {
        displayAll = true;
        renderTable(data);
        resultsInfo.innerText = '';
      });
    } else {
      resultsInfo.innerText = '';
    }
    
    displayData.forEach(item => {
      const row = document.createElement('tr');
      if (item.ellipsis) {
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.style.textAlign = 'center';
        cell.innerText = '...';
        row.appendChild(cell);
      } else {
        const dateCell = document.createElement('td');
        // Create an anchor for the date linking to the snapshot URL
        const link = document.createElement('a');
        link.href = item.url;
        link.target = "_blank";
        link.innerText = item.date;
        dateCell.appendChild(link);
        
        const serviceCell = document.createElement('td');
        serviceCell.innerText = item.service;
        const statusCell = document.createElement('td');
        statusCell.innerText = item.statuscode;
        row.appendChild(dateCell);
        row.appendChild(serviceCell);
        row.appendChild(statusCell);
      }
      tableBody.appendChild(row);
    });
  }
  
  // Function to update sort arrow icons in table headers
  function updateSortArrows(activeColumn, ascending) {
    document.querySelectorAll('#resultsTable th').forEach(th => {
      const span = th.querySelector('.sort-arrow');
      if (th.getAttribute('data-column') === activeColumn) {
        span.innerText = ascending ? '▲' : '▼';
      } else {
        span.innerText = '⇅';
      }
    });
  }
  
  // Function to sort archiveResults and re-render the table
  function sortResults(column, ascending = true) {
    archiveResults.sort((a, b) => {
      if (a[column] < b[column]) return ascending ? -1 : 1;
      if (a[column] > b[column]) return ascending ? 1 : -1;
      return 0;
    });
    updateSortArrows(column, ascending);
    renderTable(archiveResults);
  }
  
  // Set up table header sorting with clickable headers
  document.querySelectorAll('#resultsTable th').forEach(th => {
    let ascending = true;
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-column');
      sortResults(column, ascending);
      ascending = !ascending;
    });
  });
  
  // Request archive results for the current tab from the background script
  browser.runtime.sendMessage({ action: "getResults" })
    .then(response => {
      if (!response || typeof response.results === "undefined") {
        resultsCountEl.innerText = "Error: No results field in response.";
        log("Error: No results field in response.");
        return;
      }
      archiveResults = response.results;
      log("Received results: " + JSON.stringify(archiveResults));
      // Default sort by date
      archiveResults.sort((a, b) => a.date.localeCompare(b.date));
      resultsCountEl.innerText = `Total Results Found: ${archiveResults.length}`;
      renderTable(archiveResults);
    })
    .catch(error => {
      resultsCountEl.innerText = "Error fetching results: " + error.message;
      log("Error fetching results: " + error.message);
    });
});

