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
  document.body.classList.toggle("guidelines-active", id === "guidelines-screen");
  if (id === "guidelines-screen") window.scrollTo(0, 0);
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
  const bytes = Uint8Array.from(atob(json.content.replace(/\n/g, "")), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

function annotatorCount(row) {
  return csvFields
    .filter(f => f.startsWith("annotator_"))
    .filter(f => (row[f] || "").trim() !== "")
    .length;
}

function countAnnotated() {
  const col = colName();
  return csvData.filter(r => (r[col] || "").trim() !== "").length;
}

function computeTotalRows() {
  const col = colName();
  return csvData.filter(r =>
    (r[col] || "").trim() !== "" || annotatorCount(r) < 2
  ).length;
}

function nextUnannotated() {
  const col = colName();
  return csvData.findIndex(r =>
    (r[col] || "").trim() === "" && annotatorCount(r) < 2
  );
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
  localStorage.setItem("annotatorCode", annotatorCode);

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

    annotatedCount = countAnnotated();
    totalRows = computeTotalRows();
    currentRowIndex = nextUnannotated();

    if (currentRowIndex === -1) showDoneScreen();
    else showGuidelines();
  } catch (err) {
    showError("login-error", err.message);
  } finally {
    btn.disabled = false;
    spin.classList.remove("visible");
  }
});

// ─── Guidelines ───────────────────────────────────────────────────────────────
function showGuidelines() {
  const checkbox = document.getElementById("acknowledge-check");
  const btn = document.getElementById("start-annotating-btn");
  checkbox.checked = false;
  btn.disabled = true;
  checkbox.onchange = () => { btn.disabled = !checkbox.checked; };
  showScreen("guidelines-screen");
}

document.getElementById("start-annotating-btn").addEventListener("click", () => {
  showStep1();
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
        <input type="checkbox" name="category" value="${escHtml(val)}">
        ${escHtml(val)}
      </label>`);
  });

  clearError("step1-error");
  unsavedAnswer = false;
  document.getElementById("step1-form").addEventListener("change", () => { unsavedAnswer = true; }, { once: true });

  const banner = document.getElementById("resume-banner");
  if (annotatedCount > 0) {
    banner.textContent = `Resuming — you have already annotated ${annotatedCount} of ${totalRows} prompts.`;
    banner.classList.add("visible");
  } else {
    banner.classList.remove("visible");
  }

  showScreen("step1-screen");
}

document.getElementById("step1-form").addEventListener("submit", e => {
  e.preventDefault();
  clearError("step1-error");

  const checked = [...document.querySelectorAll('input[name="category"]:checked')];
  const pendingCategories = checked.map(el => el.value);

  pendingCategory = pendingCategories;
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
  document.querySelectorAll('input[name="violation"], input[name="confidence"]').forEach(r => r.checked = false);

  clearError("step2-error");
  document.getElementById("step2-form").addEventListener("change", () => { unsavedAnswer = true; }, { once: true });

  showScreen("step2-screen");
}

document.getElementById("step2-form").addEventListener("submit", async e => {
  e.preventDefault();
  clearError("step2-error");

  const violation  = document.querySelector('input[name="violation"]:checked')?.value;
  const confidence = document.querySelector('input[name="confidence"]:checked')?.value;

  if (!violation || !confidence) {
    showError("step2-error", "Please answer both questions before submitting.");
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  const spin = btn.querySelector(".spinner");
  btn.disabled = true;
  spin.classList.add("visible");

  csvData[currentRowIndex][colName()] = JSON.stringify({ category: pendingCategory, violation, confidence });
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

// ─── Pre-fill annotator code from last session ───────────────────────────────
(function () {
  const saved = localStorage.getItem("annotatorCode");
  if (saved) document.getElementById("annotator-code").value = saved;
})();

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
