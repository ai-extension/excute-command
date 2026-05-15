# 🔑 Global Variables: Shared Config & Secrets

Global Variables centralize values that many workflows need — API endpoints, install paths, credentials, environment flags — so you can change them in one place.

![Global Variables](assets/variables.png)
*Centralized management for environment constants and secrets.*

---

## 🌟 Overview

Instead of hard-coding things like `DB_HOST=prod.db.internal` inside every workflow, define them as **Global Variables**. Workflows reference them with `{{ global.KEY }}` and CSM resolves the value at run time.

### When to use a Global Variable
- A value is shared by **two or more workflows**.
- A value **changes per environment** (staging vs. production) — define one in each namespace.
- A value is a **secret** (API key, password, token) — let CSM mask it automatically.

For values used only inside a single workflow, prefer **Workflow Variables** (declared in the workflow designer); they don't pollute the global namespace.

---

## ⚙️ Anatomy of a variable

| Field | Purpose |
| :--- | :--- |
| **Key** | Identifier used in templates: `{{ global.KEY }}`. Convention: `UPPER_SNAKE_CASE`. |
| **Value** | The actual string. |
| **Secret** | When on, the value is hidden in the UI and masked in logs. |
| **Description** | Optional human note (shown in the variable list). |
| **Namespace** | Hard isolation — `dev` vs. `prod` never bleed. |

---

## 🪜 Resolution priority

When a template `{{ global.KEY }}` resolves at runtime, CSM walks this ladder (highest wins):

1. **Workflow Inputs** — overrides everything for that run.
2. **Workflow Variables** — declared on the workflow.
3. **Global Variables** — namespace fallback.

If `Workflow Input.KEY` exists, it wins even if a global with the same key is defined. This makes it easy to override a default per run.

---

## 🔒 Secret masking

When a variable is marked **Secret**:

- **UI** — value displays as `••••••••`.
- **Command preview** — the rendered command shown to the user before run hides the secret.
- **Logs** — the executor performs a final string-replace pass on stdout/stderr; any substring matching a secret value becomes `[MASKED]` before the line is persisted.
- **Audit log** — secret-valued payload fields are scrubbed before write.

> [!IMPORTANT]
> Masking is **value-based**. If your secret is `hunter2` and a command's natural output happens to print `hunter2`, that string is masked too. Don't pick generic words as secret values (e.g., avoid `admin`).

---

## ✅ Best practices

- **Naming** — `UPPER_SNAKE_CASE` distinguishes globals from workflow-local inputs at a glance.
- **One value per environment** — keep a `PROD` namespace and a `STAGING` namespace with the same keys but different values; the same workflow runs everywhere unchanged.
- **Mark secrets early** — toggling Secret after the value is already in logs does not retroactively scrub them.
- **Avoid generic words** as secret values (see warning above).
- **Don't store huge blobs** — for large files, use [Workflow Files](workflows.md#-workflow-files) instead.

---

## 🛠️ Step-by-step: define a variable

1. **Navigate** to Global Variables → **+ New**.
2. **Key** — e.g., `DEPLOY_HOST`.
3. **Value** — e.g., `app.prod.internal`.
4. **Secret** — toggle on if the value is sensitive.
5. **Description** — short note for teammates.
6. **Save**. The variable is immediately available to all workflows in this namespace via `{{ global.DEPLOY_HOST }}`.

To **override per run**, declare an input with the same key on a workflow; the input value wins for that execution.

---

## 🧠 Reference

- **Storage** — variables live in the database, encrypted at rest if your deployment configures encryption.
- **Decryption** — secrets are decrypted by the `WorkflowExecutor` at the exact moment of command execution; the plaintext never leaves the executor's memory.
- **Namespace lookup** — every fetch is scoped by the running execution's namespace; a leak across namespaces is impossible by construction.

---

## 🔧 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| `{{ global.KEY }}` renders as empty | Wrong namespace, or key typo | Confirm the variable exists in the workflow's namespace; check casing. |
| Secret value appears in old logs | Variable was not marked Secret at the time of that run | Toggling Secret only affects future runs; rotate the secret if leaked. |
| Workflow input doesn't override the global | Input is `Required` but skipped, or has a different key | Confirm the input key matches exactly; check the run dialog. |
| Mask shows random unrelated text | A short / generic secret value matched substring elsewhere | Choose a longer, unique secret value. |
