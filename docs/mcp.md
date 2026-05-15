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

| Tool | What the AI does with it |
| :--- | :--- |
| **`list_workflows`** | Discovers what's available, filterable by tag or namespace. |
| **`run_workflow`** | Triggers a specific workflow with structured inputs. Returns an `execution_id`. |
| **`get_execution_log`** | Reads logs for an `execution_id`; supports `wait=true` to poll until finished. |
| **`schedule_workflow`** | Creates a cron schedule for a workflow. |
| **`get_tags`** | Lists available tags so the AI can narrow `list_workflows`. |

Every tool call is authenticated by the API key and authorized by the key's role assignments — the AI cannot exceed the human operator's permissions.

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
