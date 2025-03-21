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

// --- Normalize URLs in attributes (href, src, style) ---
function normalizeURLs(doc) {
  const regex = /https:\/\/web\.archive\.org\/web\/\d+\/(https?:\/\/[^\s'"]+)/;
  const elements = doc.querySelectorAll("*");
  elements.forEach(el => {
    ["href", "src"].forEach(attr => {
      if (el.hasAttribute(attr)) {
        let val = el.getAttribute(attr);
        const match = regex.exec(val);
        if (match) {
          el.setAttribute(attr, match[1]);
        }
      }
    });
    if (el.hasAttribute("style")) {
      let styleVal = el.getAttribute("style");
      styleVal = styleVal.replace(/url\((['"]?)(https:\/\/web\.archive\.org\/web\/\d+\/(https?:\/\/[^\s'")]+))\1\)/g, "url($1$3$1)");
      el.setAttribute("style", styleVal);
    }
  });
}

// --- Simple hash function (djb2) for fingerprinting text nodes ---
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // 32bit integer
  }
  return hash;
}

// Use diff_match_patch to compute a word-level diff.
function diffWordsSmart(oldText, newText) {
  const dmp = new diff_match_patch();
  const delimiter = "\u0001";
  
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

// Compute a simple similarity between two strings.
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

// --- Build fingerprint list for an array of text nodes ---
function computeNodeFingerprints(nodes) {
  return nodes.map(node => {
    const text = node.textContent.trim();
    return { node: node, text: text, hash: hashString(text), length: text.length };
  });
}

// --- Compute Longest Common Subsequence (LCS) on arrays of numbers ---
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

// --- Revised diffTextNodes: aligns nodes using hash LCS then falls back to similarity diff ---
function diffTextNodesSmart(docArchived, docOriginal) {
  normalizeURLs(docArchived);
  const archivedNodes = computeNodeFingerprints(getTextNodes(docArchived));
  const originalNodes = computeNodeFingerprints(getTextNodes(docOriginal));
  
  const archivedHashes = archivedNodes.map(item => item.hash);
  const originalHashes = originalNodes.map(item => item.hash);
  
  const lcsMatches = computeLCS(archivedHashes, originalHashes);
  
  let aStart = 0, oStart = 0;
  let totalArchivedLength = archivedNodes.reduce((acc, item) => acc + item.length, 0);
  let matchedLength = 0;
  
  lcsMatches.forEach(match => {
    alignSegment(archivedNodes.slice(aStart, match.index1), originalNodes.slice(oStart, match.index2), docArchived, docOriginal);
    
    const archItem = archivedNodes[match.index1];
    const origItem = originalNodes[match.index2];
    matchedLength += archItem.length;
    if (archItem.text !== origItem.text) {
      const diffResult = diffWordsSmart(archItem.text, origItem.text);
      replaceNodeWithSpan(archItem.node, docArchived, diffResult.archivedDiff);
      replaceNodeWithSpan(origItem.node, docOriginal, diffResult.originalDiff);
    }
    aStart = match.index1 + 1;
    oStart = match.index2 + 1;
  });
  alignSegment(archivedNodes.slice(aStart), originalNodes.slice(oStart), docArchived, docOriginal);
  
  const similarityScore = totalArchivedLength > 0 ? Math.round((matchedLength / totalArchivedLength) * 100) : 0;
  document.getElementById("globalScore").innerText = "Global Similarity Score: " + similarityScore + "%";
}

// Helper: Align a segment of nodes using similarity.
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

// --- New: Diff Images ---
function diffImages(docArchived, docOriginal) {
  const archivedImages = Array.from(docArchived.querySelectorAll('img'));
  const originalImages = Array.from(docOriginal.querySelectorAll('img'));
  
  const normalizeSrc = src => {
    const regex = /https:\/\/web\.archive\.org\/web\/\d+\/(https?:\/\/[^\s'"]+)/;
    const match = regex.exec(src);
    return match ? match[1] : src;
  };

  const archivedSrcs = archivedImages.map(img => normalizeSrc(img.getAttribute("src")));
  const originalSrcs = originalImages.map(img => normalizeSrc(img.getAttribute("src")));
  
  archivedImages.forEach(img => {
    const src = normalizeSrc(img.getAttribute("src"));
    if (!originalSrcs.includes(src)) {
      if (!img.parentElement.classList.contains("removed")) {
        const wrapper = docArchived.createElement("span");
        wrapper.classList.add("removed");
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }
    }
  });
  
  originalImages.forEach(img => {
    const src = normalizeSrc(img.getAttribute("src"));
    if (!archivedSrcs.includes(src)) {
      if (!img.parentElement.classList.contains("added")) {
        const wrapper = docOriginal.createElement("span");
        wrapper.classList.add("added");
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }
    }
  });
}

// --- Compute Meta Properties Diff ---
function diffMeta(docArchived, docOriginal) {
  const metaArchived = {};
  const metaOriginal = {};
  docArchived.querySelectorAll("meta").forEach(meta => {
    const key = meta.getAttribute("name") || meta.getAttribute("property");
    if (key) {
      metaArchived[key] = meta.getAttribute("content") || "";
    }
  });
  docOriginal.querySelectorAll("meta").forEach(meta => {
    const key = meta.getAttribute("name") || meta.getAttribute("property");
    if (key) {
      metaOriginal[key] = meta.getAttribute("content") || "";
    }
  });
  
  let html = '<table class="meta-diff table table-bordered table-sm"><thead><tr><th>Meta Property</th><th>Archived</th><th>Current</th></tr></thead><tbody>';
  const allKeys = new Set([...Object.keys(metaArchived), ...Object.keys(metaOriginal)]);
  allKeys.forEach(key => {
    const aVal = metaArchived[key] || "";
    const oVal = metaOriginal[key] || "";
    if (aVal === oVal) {
      html += `<tr><td>${key}</td><td>${aVal}</td><td>${oVal}</td></tr>`;
    } else {
      let archivedCell = aVal ? `<span class="diff-archived">${aVal}</span>` : "";
      let currentCell = oVal ? `<span class="diff-current">${oVal}</span>` : "";
      html += `<tr><td>${key}</td><td>${archivedCell}</td><td>${currentCell}</td></tr>`;
    }
  });
  html += "</tbody></table>";
  return html;
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

// --- Main diffing routine ---
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
  
  // Set URL display in header.
  document.getElementById("archivedUrlDisplay").innerText = archivedUrl;
  document.getElementById("originalUrlDisplay").innerText = originalUrl;

  Promise.all([
    fetch(archivedUrl).then(r => r.text()),
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
    
    // Process images diff.
    diffImages(docArchived, docOriginal);
    
    // Compute meta diff and update element.
    const metaDiffHTML = diffMeta(docArchived, docOriginal);
    document.getElementById("metaDiff").innerHTML = metaDiffHTML;
    
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

