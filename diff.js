// diff.js

// Simple logging function.
function log(message) {
  console.log("[Diff] " + message);
}

// Parse query parameters from the URL.
function getQueryParams() {
  const params = {};
  location.search.slice(1).split("&").forEach(pair => {
    const [key, value] = pair.split("=");
    if (key) {
      params[key] = decodeURIComponent(value || "");
    }
  });
  return params;
}

// Remove Wayback Machine header/footer from the archived document.
function removeWaybackElements(doc) {
  const wmHeader = doc.querySelector("#wm-ipp");
  if (wmHeader) {
    wmHeader.remove();
    log("Removed Wayback Machine header.");
  }
  const wmFooter = doc.querySelector("#wm-footer");
  if (wmFooter) {
    wmFooter.remove();
    log("Removed Wayback Machine footer.");
  }
}

// --- New: Simple hash function (djb2) for fingerprinting text nodes ---
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

// Use diff_match_patch to compute a smarter, word-level diff.
function diffWordsSmart(oldText, newText) {
  const dmp = new diff_match_patch();
  const delimiter = "\u0001"; // A control character unlikely to appear in text.
  
  const oldTokens = oldText.split(/\s+/);
  const newTokens = newText.split(/\s+/);
  
  const oldJoined = oldTokens.join(delimiter);
  const newJoined = newTokens.join(delimiter);
  
  let diffs = dmp.diff_main(oldJoined, newJoined);
  dmp.diff_cleanupSemantic(diffs);
  
  const archivedTokens = [];
  const originalTokens = [];
  
  diffs.forEach(diff => {
    const op = diff[0];
    const tokens = diff[1].split(delimiter);
    const text = tokens.join(" ");
    
    if (op === 0) {
      archivedTokens.push(text);
      originalTokens.push(text);
    } else if (op === -1) {
      archivedTokens.push(`<span class="removed">${text}</span>`);
    } else if (op === 1) {
      originalTokens.push(`<span class="added">${text}</span>`);
    }
  });
  
  return { 
    archivedDiff: archivedTokens.join(" "),
    originalDiff: originalTokens.join(" ")
  };
}

// Get all non-empty text nodes from a document's body.
function getTextNodes(doc) {
  const nodes = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.trim() !== "") {
      nodes.push(node);
    }
  }
  return nodes;
}

// Compute a simple similarity between two strings (fraction of common words).
function similarity(a, b) {
  const wordsA = a.split(/\s+/).filter(Boolean);
  const wordsB = b.split(/\s+/).filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  let common = 0;
  wordsA.forEach(word => {
    if (wordsB.includes(word)) common++;
  });
  return common / Math.max(wordsA.length, wordsB.length);
}

// --- New: Build fingerprint list for an array of text nodes ---
function computeNodeFingerprints(nodes) {
  return nodes.map(node => {
    const text = node.textContent.trim();
    return { node: node, text: text, hash: hashString(text) };
  });
}

// --- New: Compute Longest Common Subsequence (LCS) on arrays of numbers ---
function computeLCS(seq1, seq2) {
  const m = seq1.length, n = seq2.length;
  const dp = new Array(m+1);
  for (let i = 0; i <= m; i++){
    dp[i] = new Array(n+1).fill(0);
  }
  for (let i = 1; i <= m; i++){
    for (let j = 1; j <= n; j++){
      if (seq1[i-1] === seq2[j-1]) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }
  // Reconstruct common indices
  let i = m, j = n;
  const common = [];
  while (i > 0 && j > 0) {
    if (seq1[i-1] === seq2[j-1]) {
      common.unshift({ index1: i-1, index2: j-1 });
      i--;
      j--;
    } else if (dp[i-1][j] >= dp[i][j-1]) {
      i--;
    } else {
      j--;
    }
  }
  return common;
}

// --- New: Revised diffTextNodes that aligns nodes using hash LCS then falls back to similarity diff ---
function diffTextNodesSmart(docArchived, docOriginal) {
  const archivedNodes = computeNodeFingerprints(getTextNodes(docArchived));
  const originalNodes = computeNodeFingerprints(getTextNodes(docOriginal));
  
  const archivedHashes = archivedNodes.map(item => item.hash);
  const originalHashes = originalNodes.map(item => item.hash);
  
  // Compute LCS for exact hash matches.
  const lcsMatches = computeLCS(archivedHashes, originalHashes);
  
  let aStart = 0, oStart = 0;
  
  // Process segments between common nodes.
  lcsMatches.forEach(match => {
    // Process segment before the current match.
    alignSegment(archivedNodes.slice(aStart, match.index1), originalNodes.slice(oStart, match.index2), docArchived, docOriginal);
    
    // For the matched nodes, if their text isn’t identical (hashes match implies they are identical, but for safety diff anyway)
    const archItem = archivedNodes[match.index1];
    const origItem = originalNodes[match.index2];
    if (archItem.text !== origItem.text) {
      const diffResult = diffWordsSmart(archItem.text, origItem.text);
      replaceNodeWithSpan(archItem.node, docArchived, diffResult.archivedDiff);
      replaceNodeWithSpan(origItem.node, docOriginal, diffResult.originalDiff);
    }
    aStart = match.index1 + 1;
    oStart = match.index2 + 1;
  });
  
  // Process any trailing segments.
  alignSegment(archivedNodes.slice(aStart), originalNodes.slice(oStart), docArchived, docOriginal);
}

// Helper: align a segment of nodes using similarity.
function alignSegment(archSegment, origSegment, docArchived, docOriginal) {
  let i = 0, j = 0;
  while (i < archSegment.length && j < origSegment.length) {
    const textA = archSegment[i].text;
    const textB = origSegment[j].text;
    if (similarity(textA, textB) >= 0.5) {
      const diffResult = diffWordsSmart(textA, textB);
      replaceNodeWithSpan(archSegment[i].node, docArchived, diffResult.archivedDiff);
      replaceNodeWithSpan(origSegment[j].node, docOriginal, diffResult.originalDiff);
      i++; 
      j++;
    } else {
      if (textA.length < textB.length) {
        replaceNodeWithSpan(archSegment[i].node, docArchived, `<span class="removed">${textA}</span>`);
        i++;
      } else {
        replaceNodeWithSpan(origSegment[j].node, docOriginal, `<span class="added">${textB}</span>`);
        j++;
      }
    }
  }
  while (i < archSegment.length) {
    replaceNodeWithSpan(archSegment[i].node, docArchived, `<span class="removed">${archSegment[i].text}</span>`);
    i++;
  }
  while (j < origSegment.length) {
    replaceNodeWithSpan(origSegment[j].node, docOriginal, `<span class="added">${origSegment[j].text}</span>`);
    j++;
  }
}

// Helper: Replace a text node with a span containing HTML.
function replaceNodeWithSpan(node, doc, html) {
  const span = doc.createElement("span");
  span.innerHTML = html;
  node.parentNode.replaceChild(span, node);
}

// --- Original buildFullHTML function ---
function buildFullHTML(doc) {
  const cssImports = extractCSS(doc);
  const bodyContent = doc.body.innerHTML;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        ${cssImports}
        <style>
          /* Diff highlight styles */
          .added { background-color: #e6ffe6; }
          .removed { background-color: #ffe6e6; text-decoration: line-through; }
        </style>
      </head>
      <body>
        ${bodyContent}
      </body>
    </html>
  `;
}

// Helper: Extract CSS imports (<link> and <style> tags) from a document.
function extractCSS(doc) {
  let css = "";
  const nodes = doc.querySelectorAll('link[rel="stylesheet"], style');
  nodes.forEach(node => {
    css += node.outerHTML;
  });
  return css;
}

// Main diffing routine: fetch archived and current HTML, parse and process diff.
(function() {
  log("Diff script started.");
  const params = getQueryParams();
  log("Query parameters: " + JSON.stringify(params));
  const archivedUrl = params.archivedUrl;
  const originalUrl = params.originalUrl;
  const originalTabId = parseInt(params.tabId, 10);
  if (!archivedUrl || !originalUrl || isNaN(originalTabId)) {
    log("Missing URL parameters.");
    document.body.innerHTML = "<pre>Error: Missing required URL parameters.</pre>";
    return;
  }

  Promise.all([
    fetch(archivedUrl).then(r => r.text()),
    // Retrieve the current page's full HTML (head and body) via content script.
    browser.runtime.sendMessage({ action: "getOriginalContent", tabId: originalTabId })
  ])
  .then(([archivedHTML, originalData]) => {
    log("Fetched archived HTML and current page HTML via content script.");
    const parser = new DOMParser();
    const docArchived = parser.parseFromString(archivedHTML, "text/html");
    const originalHTML = `<html><head>${originalData.head}</head><body>${originalData.body}</body></html>`;
    const docOriginal = parser.parseFromString(originalHTML, "text/html");
    
    removeWaybackElements(docArchived);
    diffTextNodesSmart(docArchived, docOriginal);
    
    const archivedFullHTML = buildFullHTML(docArchived);
    const originalFullHTML = buildFullHTML(docOriginal);
    
    document.getElementById("archivedFrame").srcdoc = archivedFullHTML;
    document.getElementById("originalFrame").srcdoc = originalFullHTML;
    
    log("Diff computed and iframes loaded successfully.");
  })
  .catch(error => {
    log("Error fetching pages or processing content: " + error.message);
    document.body.innerHTML = `<pre>Error fetching pages: ${error.message}</pre>`;
  });
})();

