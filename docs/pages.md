# 📱 Pages: Custom User Interfaces

Pages turn complex workflows into simple, shareable web UIs. They let non-technical users run automations safely without touching shell or SSH.

![Pages List](assets/pages_list.png)
*Manage and deploy custom interfaces from the Pages overview.*

---

## 🏗️ Overview

A **Page** is a public or private web view assembled from **Widgets**. Each widget either:

- triggers a **Workflow** (Endpoint widget), or
- streams a live command output (Terminal widget), or
- opens an external URL (Link widget), or
- groups other widgets visually (Section widget).

Pages have a unique **slug** in the URL (`/public/pages/{slug}`) and an optional access mode (public, private, password-protected).

### Why use Pages?
- **Safety** — operators only see the inputs you allow; no shell access required.
- **Simplicity** — one click instead of a multi-step command pipeline.
- **Reusability** — multiple Pages can wrap the same Workflow with different defaults.
- **Branding** — custom title, description, colors per Page.

---

## 🧱 Widget catalog

| Widget | Purpose | Notes |
| :--- | :--- | :--- |
| **Endpoint** | Run a Workflow | Maps to a workflow + its `inputs`. Shows status, history, and re-run buttons. |
| **Terminal** | Live command output | Streams a recurring shell command from a chosen server. Supports reload intervals. |
| **Link** | External hyperlink | Plain anchor, optional "open in new tab". |
| **Section** | Container / grouping | Acts as a drop zone — drag any non-section widget *into* a Section to nest it. Moving the Section moves all its children together. |

### Widget sizes
Every widget can be sized as **full**, **half** (1/2), or **third** (1/3) width. On the public page, three `third`-sized widgets fit on one row; mobile collapses to full width.

---

## ⚙️ Page Designer

The designer (`/pages/{id}/edit`) is a drag-and-drop canvas.

![Page Designer](assets/page_designer.png)

### Layout & nesting
- **Drag** any widget by its handle to reorder on the canvas.
- **Sections** render as bordered containers with their own drop zone.
  - Drop other widgets *inside* a section to nest them.
  - Drop them back on the outer canvas to detach.
  - Moving a section in the outer list keeps every nested child attached.
- Sections cannot be nested inside other sections.

### Button style picker
For **Endpoint** and **Link** widgets, the "Style" field exposes:
- **Presets** — Premium Blue, Neon Emerald, Cyber Rose, Deep Indigo, Atomic Amber. Click a chip to apply.
- **Custom color** — click the palette icon to open a color picker. Hex input + live preview included. The selected color is rendered with a matching glow shadow on the public page.

### Per-widget configuration (Endpoint)
| Field | What it does |
| :--- | :--- |
| **Target Workflow** | Workflow that runs when the button is clicked. |
| **Button Label** | Visible button text. Defaults to workflow name. |
| **Style** | Preset or custom color (see picker above). |
| **Description** | Subtitle shown on the public widget card. |
| **Show Log** | If on, opens the live terminal automatically while running. Otherwise the run is silent (toast only). |
| **Size** | full / half / third. |

---

## 🌐 Public page experience

The public view at `/public/pages/{slug}` is the screen you share with your team.

### Header
- **Title + description** from the Page meta.
- **Endpoint / Terminal counters** above the grid.
- **Copy URL** and **light/dark theme toggle** in the top-right. Default theme is **light**; user choice persists in `localStorage`.

### Search
A search bar above the grid filters widgets by title or description. Searching inside a section keeps the section header visible.

### Execution history (per Endpoint widget)
Each Endpoint widget remembers the **last 10 runs** locally (`localStorage` keyed by page slug + widget id):

- **History button** — clock icon with a count badge; opens a list of past runs.
- **Each history row shows** status (running/success/failed/cancelled), short execution ID, inputs used, and timestamp.
- **Re-run** — runs the workflow again with the saved inputs, skipping the input prompt.
- **View Log** — fetches the archived `workflow.log` from the backend and renders it with ANSI colors in a dialog. Works for past runs even if you closed the live terminal.
- **Quick-rerun shortcut** — a small button next to the main "Initiate" button re-runs the most recent execution with its inputs.

### Live execution terminal
While a workflow is running (and "Show Log" is on for that widget), a floating terminal panel streams logs in real time:

- **Yellow button** toggles **minimize ↔ restore**.
- **Green button** toggles **maximize ↔ normal**.
- **Red button** closes the terminal.
- **Drag** by the header to move the panel anywhere on screen.
- **Resize** by dragging the bottom-right corner (similar to a `<textarea>`).
- Position and size persist across status updates until you maximize or close.

---

## 🔒 Access control

Pages support three visibility modes:

| Mode | Behavior |
| :--- | :--- |
| **Public** | Anyone with the slug URL can use the page. |
| **Public + password** | Visitor must enter the unlock password; backend issues a short-lived **page token** (default TTL: 15 min). The token is required by every workflow trigger. |
| **Private** | Requires a logged-in CSM user with `page:read` permission on the namespace. |

When a token expires, the visitor is prompted to re-enter the password without losing form state.

---

## 🛠️ Build & deploy checklist

1. **Choose a workflow** — make sure it accepts the inputs you want exposed.
2. **Create the Page** — set title, description, slug.
3. **Drop widgets** — start with one Endpoint widget per action.
4. **Group with Sections** — drag related widgets into a Section for visual grouping.
5. **Pick colors** — use a preset or custom hex to match team branding.
6. **Choose access** — public / public+password / private.
7. **Test** — open `/public/pages/{slug}` in an incognito window.
8. **Share** — distribute the URL.

> [!TIP]
> You can create multiple Pages pointing at the same Workflow to provide different views (e.g., a "staging" page and a "production" page with different default inputs and stricter passwords).

---

## 🔧 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| "View Log" returns *log file not found* | Backend cleaned up logs, or execution was very recent and `workflow.log` not yet flushed | Wait a few seconds and retry; older runs may have been pruned. |
| Theme reverts on reload | Old admin theme overrode public theme | Already handled — the public page now drives the global theme provider directly. |
| Custom button color doesn't appear | Browser blocked third-party storage / value was hand-edited | Re-pick the color from the palette to refresh the saved `custom:#hex` token. |
| Token expired mid-run | TTL elapsed during a long workflow | Increase TTL on the Page settings or extend session by re-entering the password. |
