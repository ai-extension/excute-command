# 📖 CSM Documentation Center

Welcome to the **Command Step Manager (CSM)** documentation. This center is organized so any reader — from non-technical operator to platform engineer — can find what they need quickly.

---

## 🧭 How to read these docs

| If you are… | Start here | Then read |
| :--- | :--- | :--- |
| **Brand-new to CSM** | [📘 User Manual](user_manual.md) — the "what" and "why" in plain English | [🚀 Getting Started](getting_started.md) |
| **An operator / team member** | [🚀 Getting Started](getting_started.md) — 5-minute hands-on tour | [📱 Pages](pages.md) for the user-facing UI |
| **An automation builder** | [⚙️ Workflows](workflows.md) — full orchestration reference | [🔑 Variables](variables.md), [📅 Schedules](schedules.md) |
| **An admin / SecOps** | [🔐 Roles & Permissions](roles.md) | [📜 Audit Logs](audit_logs.md) |
| **An AI / integration engineer** | [🤖 MCP Integration](mcp.md) | [⚙️ Workflows](workflows.md) |

---

## 🌟 What is CSM in one paragraph?

CSM is a **command orchestration platform**. You define reusable **Workflows** (multi-step command pipelines), point them at one or more **Servers** (SSH or local), and expose them safely to your team via **Pages** (custom web UIs) or **Schedules** (cron triggers). Every execution is captured in real-time logs with full audit trail, and AI agents can drive the same workflows via MCP.

---

## 🧩 Core concepts at a glance

```
Server      → "Who" runs the command (SSH host, local machine, VPN endpoint)
Workflow    → "What" gets executed (groups → steps → commands)
Input       → "Parameters" passed at run-time (text, select, switch, file…)
Page        → "Friendly UI" wrapping a workflow for non-technical users
Schedule    → "Cron alarm clock" that fires a workflow automatically
Variable    → "Shared config / secret" available across workflows
Role        → "Permission bundle" assigned to users (namespace-scoped)
Execution   → A single run instance with status, logs, and history
Namespace   → Tenant boundary; resources are partitioned per namespace
```

A typical flow: an **operator** opens a **Page** → fills inputs → clicks a button → the Page triggers a **Workflow** on one or more **Servers** → real-time logs stream back → result + log archived as an **Execution** → audit log records who/what/when.

---

## ⚡ Quickstart (TL;DR)

```bash
# 1. install deps + build
make install

# 2. boot Postgres
make db-up

# 3. start backend
make run-be

# 4. start frontend (new terminal)
make run-fe

# open http://localhost:5173 — log in with the bootstrap admin user
```

Detailed walk-through: [Getting Started](getting_started.md).

---

## 📚 Resource guides

Deep references for each subsystem:

- **[📘 User Manual](user_manual.md)** — plain-English concept guide (no jargon).
- **[🚀 Getting Started](getting_started.md)** — first 5 minutes, with screenshots.
- **[⚙️ Workflows](workflows.md)** — groups, steps, Pongo2 templating, parallel execution.
- **[📱 Pages](pages.md)** — page designer, widget catalog, public/private modes, theme, history, log viewer.
- **[📅 Schedules](schedules.md)** — cron-driven recurring runs.
- **[🔑 Global Variables](variables.md)** — shared config and secret injection.
- **[🔐 Roles & Permissions](roles.md)** — namespace-scoped RBAC.
- **[📜 Audit Logs](audit_logs.md)** — traceability and compliance.
- **[🤖 MCP Integration](mcp.md)** — exposing workflows to AI agents.

---

## 🆘 Getting help

- Check the relevant resource guide above first — most questions are covered.
- Inspect **Audit Logs** for who-did-what when something looks off.
- Open an issue in the repo for bugs / feature requests.
