// ─── State ────────────────────────────────────────────────────────────────────
let annotatorCode = "";
let pat = "";
let csvData = [];
let csvFields = [];
let csvSha = "";
let currentRowIndex = -1;
let totalRows = 0;
let annotatedCount = 0;
let unsavedAnswer = false;
let pendingCategory = "";   // holds Q1 answer while annotator is on step 2

const colName = () => `annotator_${annotatorCode}`;

// ─── Screen helpers ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showError(containerId, msg) {
  const el = document.getElementById(containerId);
  el.textContent = msg;
  el.classList.add("visible");
}

function clearError(containerId) {
  document.getElementById(containerId).classList.remove("visible");
}

function updateProgress() {
  const pct = totalRows > 0 ? (annotatedCount / totalRows) * 100 : 0;
  const label = `${annotatedCount} of ${totalRows} annotated`;
  ["s1", "s2"].forEach(p => {
    document.getElementById(`${p}-progress-label`).textContent = label;
    document.getElementById(`${p}-progress-fill`).style.width = `${pct}%`;
  });
}

// ─── GitHub API helpers ───────────────────────────────────────────────────────
function apiUrl() {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.filePath}`;
}

async function fetchCsv() {
  const res = await fetch(`${apiUrl()}?ref=${CONFIG.branch}`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
  const json = await res.json();
  csvSha = json.sha;
  return atob(json.content.replace(/\n/g, ""));
}

async function pushCsv(csvString) {
  const encoded = btoa(unescape(encodeURIComponent(csvString)));
  let attempt = 0;
  while (attempt < 3) {
    const res = await fetch(apiUrl(), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `annotate: ${annotatorCode} row ${currentRowIndex}`,
        content: encoded,
        sha: csvSha,
        branch: CONFIG.branch,
      }),
    });
    if (res.status === 409) { await refreshSha(); attempt++; continue; }
    if (!res.ok) throw new Error(`Push failed ${res.status}: ${res.statusText}`);
    const json = await res.json();
    csvSha = json.content.sha;
    return;
  }
  throw new Error("Could not resolve SHA conflict after 3 attempts. Reload and try again.");
}

async function refreshSha() {
  const res = await fetch(`${apiUrl()}?ref=${CONFIG.branch}`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return;
  const json = await res.json();
  csvSha = json.sha;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function serializeCsv() {
  return Papa.unparse({ fields: csvFields, data: csvData });
}

function domainValues() {
  const vals = [...new Set(csvData.map(r => (r["domain"] || "").trim()))].filter(Boolean);
  vals.sort();
  return vals;
}

function countAnnotated() {
  const col = colName();
  return csvData.filter(r => (r[col] || "").trim() !== "").length;
}

function nextUnannotated() {
  const col = colName();
  return csvData.findIndex(r => (r[col] || "").trim() === "");
}

// ─── Login ────────────────────────────────────────────────────────────────────
document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  clearError("login-error");

  const rawCode = document.getElementById("annotator-code").value.trim().toLowerCase().replace(/\s+/g, "_");
  const rawPat  = document.getElementById("github-pat").value.trim();

  if (!/^[a-z0-9_]{1,32}$/.test(rawCode)) {
    showError("login-error", "Code must be 1–32 characters: letters, numbers, underscores only.");
    return;
  }
  if (!rawPat) {
    showError("login-error", "Please enter your GitHub Personal Access Token.");
    return;
  }

  annotatorCode = rawCode;
  pat = rawPat || CONFIG.pat;
  sessionStorage.setItem("annotatorCode", annotatorCode);

  const btn = e.target.querySelector("button[type=submit]");
  const spin = btn.querySelector(".spinner");
  btn.disabled = true;
  spin.classList.add("visible");

  try {
    const csvText = await fetchCsv();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    csvData = parsed.data;
    csvFields = parsed.meta.fields;

    if (!csvFields.includes(colName())) {
      csvFields.push(colName());
      csvData.forEach(r => { r[colName()] = ""; });
    }

    totalRows = csvData.length;
    annotatedCount = countAnnotated();
    currentRowIndex = nextUnannotated();

    if (currentRowIndex === -1) showDoneScreen();
    else showStep1();
  } catch (err) {
    showError("login-error", err.message);
  } finally {
    btn.disabled = false;
    spin.classList.remove("visible");
  }
});

// ─── Step 1: Category ─────────────────────────────────────────────────────────
function showStep1() {
  const row = csvData[currentRowIndex];

  updateProgress();
  document.getElementById("s1-prompt-text").textContent = row["question"] || "(no prompt)";

  // Build category radio buttons from distinct domain values
  const catGroup = document.getElementById("category-group");
  catGroup.innerHTML = "";
  domainValues().forEach(val => {
    catGroup.insertAdjacentHTML("beforeend", `
      <label>
        <input type="radio" name="category" value="${escHtml(val)}">
        ${escHtml(val)}
      </label>`);
  });

  clearError("step1-error");
  unsavedAnswer = false;
  document.getElementById("step1-form").addEventListener("change", () => { unsavedAnswer = true; }, { once: true });

  showScreen("step1-screen");
}

document.getElementById("step1-form").addEventListener("submit", e => {
  e.preventDefault();
  clearError("step1-error");

  const category = document.querySelector('input[name="category"]:checked')?.value;
  if (!category) {
    showError("step1-error", "Please select a category before continuing.");
    return;
  }

  pendingCategory = category;
  showStep2();
});

// ─── Step 2: Policy reveal + color questions ──────────────────────────────────
function showStep2() {
  const row = csvData[currentRowIndex];
  const actualDomain = (row["domain"] || "").trim();

  updateProgress();
  document.getElementById("s2-prompt-text").textContent = row["question"] || "(no prompt)";

  // Render domain policy
  const policyRules = DOMAIN_POLICY[actualDomain] || [];
  const policyBox = document.getElementById("policy-box");
  if (policyRules.length) {
    const domainLabel = actualDomain.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    policyBox.innerHTML = `
      <p class="policy-title">Domain Policy &mdash; ${escHtml(domainLabel)}</p>
      ${policyRules.map(r => `
        <div class="policy-rule">
          <span class="policy-code">${escHtml(r.code)}</span>
          <span class="policy-name">${escHtml(r.name)}</span>
          <p class="policy-desc">${escHtml(r.description)}</p>
        </div>`).join("")}`;
  } else {
    policyBox.innerHTML = "";
  }

  // Reset color radios
  document.querySelectorAll('input[name="color3"], input[name="color2"]').forEach(r => r.checked = false);

  clearError("step2-error");
  document.getElementById("step2-form").addEventListener("change", () => { unsavedAnswer = true; }, { once: true });

  showScreen("step2-screen");
}

document.getElementById("step2-form").addEventListener("submit", async e => {
  e.preventDefault();
  clearError("step2-error");

  const color3 = document.querySelector('input[name="color3"]:checked')?.value;
  const color2 = document.querySelector('input[name="color2"]:checked')?.value;

  if (!color3 || !color2) {
    showError("step2-error", "Please answer both colour questions before submitting.");
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  const spin = btn.querySelector(".spinner");
  btn.disabled = true;
  spin.classList.add("visible");

  csvData[currentRowIndex][colName()] = JSON.stringify({ category: pendingCategory, color3, color2 });
  unsavedAnswer = false;
  annotatedCount++;

  try {
    await pushCsv(serializeCsv());
  } catch (err) {
    csvData[currentRowIndex][colName()] = "";
    annotatedCount--;
    unsavedAnswer = true;
    showError("step2-error", err.message);
    btn.disabled = false;
    spin.classList.remove("visible");
    return;
  }

  currentRowIndex = nextUnannotated();
  btn.disabled = false;
  spin.classList.remove("visible");

  if (currentRowIndex === -1) showDoneScreen();
  else showStep1();
});

// ─── Done screen ──────────────────────────────────────────────────────────────
function showDoneScreen() {
  showScreen("done-screen");
}

// ─── Unsaved-work guard ───────────────────────────────────────────────────────
window.addEventListener("beforeunload", e => {
  if (unsavedAnswer) { e.preventDefault(); }
});

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
