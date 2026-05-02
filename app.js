// ─── State ────────────────────────────────────────────────────────────────────
let annotatorCode = "";
let pat = "";
let csvData = [];          // array of row objects (PapaParse)
let csvFields = [];        // ordered header fields
let csvSha = "";           // current blob SHA (required for PUT)
let currentRowIndex = -1;
let totalRows = 0;
let annotatedCount = 0;
let unsavedAnswer = false;

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

// ─── GitHub API helpers ───────────────────────────────────────────────────────
function apiUrl() {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.filePath}`;
}

async function fetchCsv() {
  const res = await fetch(`${apiUrl()}?ref=${CONFIG.branch}`, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
    },
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
    if (res.status === 409) {
      // Conflict — re-fetch SHA and retry
      await refreshSha();
      attempt++;
      continue;
    }
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

// ─── Login screen ─────────────────────────────────────────────────────────────
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

    // Ensure annotator column exists
    if (!csvFields.includes(colName())) {
      csvFields.push(colName());
      csvData.forEach(r => { r[colName()] = ""; });
    }

    totalRows = csvData.length;
    annotatedCount = countAnnotated();
    currentRowIndex = nextUnannotated();

    if (currentRowIndex === -1) {
      showDoneScreen();
    } else {
      showAnnotationScreen();
    }
  } catch (err) {
    showError("login-error", err.message);
  } finally {
    btn.disabled = false;
    spin.classList.remove("visible");
  }
});

// ─── Annotation screen ────────────────────────────────────────────────────────
function showAnnotationScreen() {
  showScreen("annotate-screen");
  renderPrompt();
}

function renderPrompt() {
  const row = csvData[currentRowIndex];
  const promptText = row["question"] || "(no prompt)";

  // Progress
  const pct = totalRows > 0 ? (annotatedCount / totalRows) * 100 : 0;
  document.getElementById("progress-label").textContent =
    `${annotatedCount} of ${totalRows} annotated`;
  document.getElementById("progress-fill").style.width = `${pct}%`;

  // Prompt text
  document.getElementById("prompt-text").textContent = promptText;

  // Q1 — Category (dynamic from domain column)
  const catGroup = document.getElementById("category-group");
  catGroup.innerHTML = "";
  domainValues().forEach(val => {
    const id = `cat_${val.replace(/\W/g, "_")}`;
    catGroup.insertAdjacentHTML("beforeend", `
      <label>
        <input type="radio" name="category" value="${escHtml(val)}" id="${id}">
        ${escHtml(val)}
      </label>`);
  });

  // Reset Q2 and Q3
  document.querySelectorAll('input[name="color3"], input[name="color2"]').forEach(r => r.checked = false);

  clearError("annotate-error");
  unsavedAnswer = false;

  // Track any change as "unsaved"
  document.getElementById("annotate-form").addEventListener("change", () => { unsavedAnswer = true; }, { once: true });
}

document.getElementById("annotate-form").addEventListener("submit", async e => {
  e.preventDefault();
  clearError("annotate-error");

  const category = document.querySelector('input[name="category"]:checked')?.value;
  const color3   = document.querySelector('input[name="color3"]:checked')?.value;
  const color2   = document.querySelector('input[name="color2"]:checked')?.value;

  if (!category || !color3 || !color2) {
    showError("annotate-error", "Please answer all three questions before submitting.");
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  const spin = btn.querySelector(".spinner");
  btn.disabled = true;
  spin.classList.add("visible");

  // Save into in-memory CSV
  csvData[currentRowIndex][colName()] = JSON.stringify({ category, color3, color2 });
  unsavedAnswer = false;
  annotatedCount++;

  try {
    await pushCsv(serializeCsv());
  } catch (err) {
    // Revert in-memory change so state stays consistent
    csvData[currentRowIndex][colName()] = "";
    annotatedCount--;
    unsavedAnswer = true;
    showError("annotate-error", err.message);
    btn.disabled = false;
    spin.classList.remove("visible");
    return;
  }

  currentRowIndex = nextUnannotated();
  btn.disabled = false;
  spin.classList.remove("visible");

  if (currentRowIndex === -1) {
    showDoneScreen();
  } else {
    renderPrompt();
  }
});

// ─── Done screen ──────────────────────────────────────────────────────────────
function showDoneScreen() {
  showScreen("done-screen");
}

// ─── Unsaved-work guard ───────────────────────────────────────────────────────
window.addEventListener("beforeunload", e => {
  if (unsavedAnswer) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
