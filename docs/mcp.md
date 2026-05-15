# 🤖 MCP Integration: AI Agents Drive CSM

CSM ships with a built-in **Model Context Protocol (MCP) Server** that exposes your workflows as tools an AI agent (Claude Desktop, Claude Code, Cursor, Gemini, custom clients) can call directly. Your existing automation becomes an AI-accessible operational brain — no new APIs to write.

---

## 🌟 Overview

MCP is an open protocol for letting an LLM call into your system's capabilities. CSM acts as an **MCP server**: it advertises a set of tools (your workflows + a few helpers), and any compliant MCP client can:

1. **Discover** — list workflows, their descriptions, input schemas, and tags.
2. **Execute** — run a workflow with structured inputs.
3. **Monitor** — fetch real-time or historical execution logs.
4. **Schedule** — set up cron-triggered runs.

The AI talks to CSM; CSM talks to your servers; everything is recorded in [Audit Logs](audit_logs.md) with `trigger_source = MCP`.

### When to enable MCP
- You want **conversational ops** — "deploy the latest staging build" instead of clicking through a UI.
- You're building an **agentic automation** (Claude / Gemini agent that decides which workflow to run).
- You want the AI to **inspect logs** and self-correct on failures.

If you only need a UI for humans, you don't need MCP — Pages are enough.

---

## 🔌 Connection details

| Setting | Value |
| :--- | :--- |
| **Transport** | `SSE` (Server-Sent Events) |
| **Endpoint** | `http://<csm-host>/api/mcp` |
| **Auth header** | `X-API-Key: <your-mcp-key>` |

### Creating an MCP-enabled API key
1. Log into CSM → **Profile** (top right) → **API Keys**.
2. **+ New API Key**.
3. Give it a descriptive name (e.g., `claude-desktop`).
4. **CRITICAL**: tick **Enable MCP** — without this, the key is rejected by `/api/mcp`.
5. (Optional) Restrict the key's permissions (recommended: read + execute on a workflow subset).
6. Copy the key once; CSM never shows the plaintext again.

### Example client snippet (Claude Desktop)
The **API Keys** screen shows a pre-generated config snippet — paste it into the client's settings file.

---

## 🛠️ Available tools

The MCP server exposes 5 tools. Each tool's call is authenticated by the API key and authorized by the key's role assignments — the AI cannot exceed the human operator's permissions.

### 1. `list_workflows`
Discover what is available.

| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `tags` | string | no | Comma-separated **tag IDs** (not names) to filter by. Get IDs from `get_tags`. |

Returns metadata for each workflow: `id`, `name`, `description`, `ai_guide`, `inputs[]` (key/type/required/default/options), `tags[]`. Only workflows the API key has `workflow:execute` on are returned.

### 2. `run_workflow`
Trigger an execution.

| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `workflow_id` | UUID | **yes** | Workflow to run. |
| `inputs` | JSON string | no | Input values, e.g., `{"branch":"main","dry_run":"yes"}`. Validated by each input's regex. |

Returns the new `execution_id` immediately. Status is `RUNNING`; use `get_execution_log` to follow up.

### 3. `get_execution_log`
Read status + logs for a specific run.

| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `execution_id` | UUID | **yes** | Returned by `run_workflow`. |
| `wait` | bool | no | If `true`, the call blocks for up to **30 seconds** waiting for terminal status — saves the AI from polling. |

Returns step-level status (RUNNING / SUCCESS / FAILED / CANCELLED), durations, stdout/stderr per step, and the workflow-level outcome.

### 4. `schedule_workflow`
Create a recurring or one-time schedule.

| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `workflow_id` | UUID | **yes** | Workflow to schedule. |
| `name` | string | **yes** | Schedule label (e.g., `nightly-backup`). |
| `type` | string | **yes** | `RECURRING` or `ONE_TIME`. |
| `cron_expression` | string | for RECURRING | 6-field cron (see [Schedules](schedules.md#-cron-syntax-6-fields-with-seconds)). |
| `next_run_at` | RFC3339 | for ONE_TIME | Absolute time to fire once. |
| `inputs` | JSON string | no | Preset inputs handed to every triggered run. |

### 5. `get_tags`
List all tags with their IDs. Always call this first if you plan to filter `list_workflows` by tag.

---

## 🔗 What you can build with these tools

The 5 tools are intentionally small — the power is in **chaining** them. Below are concrete flow patterns the AI can execute on your behalf.

### Pattern 1 — Conversational ops ("run X")
> *"Restart the staging app."*

1. `list_workflows` → find `restart-staging`.
2. Ask the user to confirm inputs (per the workflow's AI Guide).
3. `run_workflow(workflow_id, inputs)` → get `execution_id`.
4. `get_execution_log(execution_id, wait=true)` → report success/failure with the relevant log tail.

### Pattern 2 — Diagnose then act
> *"The website feels slow — check it and fix if simple."*

1. `get_tags` → grab the `diagnostic` tag id.
2. `list_workflows(tags=<diag_id>)` → list diagnostic flows.
3. `run_workflow(health-check)` → `get_execution_log(wait=true)`.
4. Parse output. If "disk full" detected, run `cleanup-logs`. If unsure, stop and report to the user — the AI Guide should forbid auto-mitigation without consent.

### Pattern 3 — Fan-out / batch
> *"Deploy to every server in the prod fleet."*

1. `list_workflows` → find `deploy-one-host`.
2. Loop: for each host, `run_workflow(workflow_id, inputs={"host":H})` → collect `execution_id`s.
3. `get_execution_log(wait=true)` per id, or poll a few in parallel.
4. Summarize successes / failures for the user.

Alternative: build a single workflow with **Nested Workflow / Dynamic Foreach** step (see [Workflows — Step specializations](workflows.md#workflow-nested)) so the AI only makes one call.

### Pattern 4 — Schedule via chat
> *"Run the nightly backup at 2am Tokyo time."*

1. `list_workflows` → find `nightly-backup`.
2. `schedule_workflow(workflow_id, name="nightly-backup-tokyo", type="RECURRING", cron_expression="0 0 2 * * *", inputs="{...}")`.
3. Confirm the schedule was created; report `next_run_at` to the user.

### Pattern 5 — Post-run investigation
> *"Why did execution `abcd-1234` fail?"*

1. `get_execution_log(execution_id="abcd-1234")` → read stderr + failed step.
2. Cross-reference with `list_workflows` to inspect the failing step's purpose.
3. Suggest a fix or re-run with corrected inputs — but **only after** the user explicitly approves the re-run.

### Pattern 6 — Self-service onboarding
> *"What can I do here?"*

1. `get_tags` + `list_workflows` → produce a categorized catalog.
2. For each workflow, surface its `description` and `ai_guide` so the AI can speak about it accurately.
3. Stop. Let the user pick.

---

## 🚧 Guardrails baked into the tools

- Every tool description includes the rule: **AI must not re-run or substitute a workflow without explicit user consent.** Honor it in your client prompt.
- `run_workflow` requires inputs that pass each workflow's `SecurityRegex`; malformed values are rejected before any command runs.
- Permission check is enforced on every call — the AI cannot enumerate or run anything the API key wasn't granted.
- All five tools record entries in [Audit Logs](audit_logs.md) with `trigger_source = MCP` and the calling API key's id.

---

## 📝 Designing workflows for AI

The AI's success depends on metadata. Workflows are far more usable when:

- **Description** is filled in — the AI reads this to decide when to call a workflow.
- **AI Guide** (workflow setting) gives specific rules: when to use it, when not to, expected inputs, what success looks like.
- **Input keys** are descriptive: `git_branch`, `target_env`, `dry_run` — not `var1`, `x`.
- **Tags** group related workflows: `release`, `diagnostic`, `cleanup`.
- **Sample inputs** in the description help the AI guess sensible defaults.

> [!TIP]
> Treat the AI like a new team member. If a junior engineer would need a sentence to understand when to run this workflow, write that sentence in the AI Guide.

---

## ✅ Best practices

- **Scope keys narrowly** — a key with only `workflow:execute` on the `diagnostics` tag is much safer than a global admin key.
- **Per-agent keys** — give each AI client its own key so audit log entries are unambiguous.
- **Read-only first** — start an agent with `workflow:read` + `get_execution_log` only; promote to execute once you trust it.
- **Watch the audit log** — `trigger_source = MCP` shows exactly what the AI ran and with which inputs.
- **Set workflow timeouts** — agents can loop; timeouts and circuit breakers are your safety net.

---

## 🛠️ Step-by-step: hook up Claude Desktop

1. **Create an MCP API key** (see above).
2. Open Claude Desktop settings → **MCP servers** → add a new server.
3. Paste the SSE endpoint `http://<csm-host>/api/mcp` and the `X-API-Key` header.
4. Restart Claude Desktop.
5. In a new conversation, ask: *"List the workflows you can run on CSM."* — Claude calls `list_workflows` and shows the catalog.
6. Try a safe diagnostic: *"Run the server-uptime check on web-1."* — Claude calls `run_workflow`, then `get_execution_log` with `wait=true`.

---

## 🧠 Reference

- **Protocol** — Model Context Protocol over SSE, JSON-RPC framing.
- **Auth** — `X-API-Key` header; key must have **Enable MCP** ticked.
- **Authorization** — every tool call goes through the same RBAC check as a UI action; see [Roles](roles.md).
- **Rate limiting** — per-key, configurable in server settings.
- **Tracing** — every tool invocation creates an audit log entry.

---

## 🔧 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| Client connects but no tools listed | Key missing **Enable MCP** | Edit the key, tick the box, reconnect the client. |
| `run_workflow` returns `403` | Key's role lacks `workflow:execute` for that workflow's namespace / item | Add the permission via [Roles](roles.md). |
| AI picks the wrong workflow | Descriptions or AI Guide are vague | Add explicit `When to use` / `Do not use when` notes to the workflow's AI Guide. |
| `get_execution_log` returns empty | Execution still pending and `wait=false` | Retry with `wait=true`, or poll the `execution_id`. |
| Auditing is unclear about which agent ran what | Multiple agents share one key | Issue one key per agent; revoke the shared one. |
