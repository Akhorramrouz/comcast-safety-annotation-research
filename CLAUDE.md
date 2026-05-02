# Annotation Web App

## Project Overview

A static web annotation tool hosted on GitHub Pages. Annotators visit the page, enter their code, and label prompts one by one. All annotations are persisted back to a CSV file in this repository via the GitHub API.

## Data Source

- **File:** `data/prompts.csv` (in this repo)
- **Key columns:**
  - `generated prompts` — the text shown to the annotator
  - `domain` — existing categories; the distinct values of this column populate the category multiple-choice question
  - One column per annotator code (e.g. `annotator_alice`) — created on first use, stores per-row annotation results as a JSON string or delimited value

### Annotation record format (per cell)

Each annotator column cell stores a JSON object:
```json
{ "category": "Science", "color3": "blue", "color2": "red" }
```
Empty string = not yet annotated by this user.

## Annotation Workflow

1. **Landing page** — user enters their name or code (trimmed, lowercased, spaces→underscores). Stored in `sessionStorage`.
2. **Load CSV** — fetch `data/prompts.csv` from the repo (raw GitHub URL). Parse with a CSV parser (PapaParse).
3. **Resume logic** — find the first row where the annotator's column is empty (or the column doesn't exist yet). Skip already-annotated rows.
4. **Per-prompt annotation screen** — show one prompt at a time with three questions:
   - **Q1 — Category:** radio buttons, one per distinct value in the `domain` column (sorted alphabetically)
   - **Q2 — Color (3-way):** "If you had to label this prompt, would it be blue, red, or yellow?" — radio: Blue / Red / Yellow
   - **Q3 — Color (2-way):** "Choosing only between red and blue, which would you pick?" — radio: Red / Blue
5. **Submit** — save the three answers into the in-memory CSV, advance to the next unannotated row.
6. **Persist** — after each submission, write the updated CSV back to the repo via the GitHub Contents API (create or update the file). Requires a GitHub Personal Access Token (PAT) with `repo` scope.
7. **Completion screen** — shown when no unannotated rows remain for this user.

## Persistence Strategy: GitHub API

Since GitHub Pages is static (no server), writes go through the GitHub REST API:

```
PUT https://api.github.com/repos/{owner}/{repo}/contents/data/prompts.csv
```

The PAT is entered by the user on the login screen (or hard-coded in a config if the repo is private and you accept the security trade-off). The file's current SHA is required for updates — fetch it alongside the file content.

### Alternative backends (if GitHub API becomes cumbersome)
- **Firebase Firestore** — store each annotation as a document `{annotatorCode, rowIndex, answers}`; export to CSV when done
- **Export-only** — save to `localStorage`, provide a "Download my annotations" button; merge CSV files manually

## Tech Stack

- **Vanilla HTML/CSS/JS** — no build step, no framework; must work as a single `index.html` or a small set of static files
- **PapaParse** (CDN) — CSV parsing and serialization
- **No backend** — all logic runs in the browser

## File Structure

```
annotation_web_app/
├── index.html          # single-page app shell
├── style.css
├── app.js              # all application logic
├── config.js           # repo owner, repo name, branch, file path, (optional) PAT
├── data/
│   └── prompts.csv     # the source data file
└── CLAUDE.md
```

## Key Constraints & Notes

- **Concurrent edits:** if two annotators submit at the same time they will conflict on the CSV SHA. Acceptable for small teams; mitigate by retrying on 409.
- **PAT security:** never commit a real PAT. If you hard-code it in `config.js`, keep the repo private. Prefer asking the user to paste it at login.
- **CSV encoding:** use UTF-8. PapaParse handles quoted fields and commas inside values.
- **Column naming:** annotator column name = `annotator_<code>`. Validate the code on entry (alphanumeric + underscore only, max 32 chars).
- **Domain values:** read dynamically from the `domain` column at load time — do not hard-code categories.
- **Progress indicator:** show "X of N prompts annotated" on the annotation screen.
- **No navigation away mid-session** — warn the user if they try to close the tab with unsaved work (unsaved = answered but not yet committed).

## Out of Scope

- Multi-language support
- Admin dashboard / inter-annotator agreement calculation
- Authentication beyond a shared PAT or annotator code
