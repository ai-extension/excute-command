# 📜 Audit Logs: Full Traceability

Every meaningful action in CSM — config change, login, workflow run — is recorded in an append-only audit log. Use it to investigate incidents, satisfy compliance, and answer "who did what, when, and how" without guesswork.

![Audit Logs](assets/audit_logs.png)
*Reviewing system activity in the Audit Logs timeline.*

---

## 🌟 Overview

The audit log answers four questions for every event:

```
WHO   — the user (or API key) that performed the action
WHAT  — the resource and the action (e.g., Workflow.Update)
WHEN  — UTC timestamp
WHERE — IP, namespace, and (for workflow runs) the trigger source
```

It's a flat, append-only stream — no edits, no deletes from the UI. The store is designed so an attacker who compromised an admin account cannot quietly rewrite history.

### When to consult the audit log
- A workflow ran unexpectedly — who or what triggered it?
- A configuration changed and broke something — what was the old value?
- Investigating a security incident or completing a compliance review.
- Detecting suspicious access patterns (e.g., repeated `403` denials).

---

## 📚 What gets recorded

| Resource type | Common actions |
| :--- | :--- |
| **`Workflow`** | `Create`, `Update`, `Delete`, `Execute`, `Clone` |
| **`Page`** | `Create`, `Update`, `Delete`, `View` |
| **`Server`** | `Create`, `Update`, `Delete`, `TestConnection` |
| **`Schedule`** | `Create`, `Update`, `Delete`, `Toggle`, `ManualTrigger` |
| **`User`** | `Login`, `Logout`, `Create`, `UpdateStatus`, `UpdateRole` |
| **`Role`** | `Create`, `Update`, `Delete`, `Assign`, `Unassign` |
| **`GlobalVariable`** | `Create`, `Update`, `Delete` |
| **`APIKey`** | `Create`, `Revoke`, `Use` |

Each entry is tagged with the **namespace** so you can filter by environment.

---

## 🧾 Payload structure

The payload is a JSON snapshot of the event:

- **Updates** carry `before` and `after` slices of the fields that changed (not the whole record).
- **Executions** carry the `inputs` passed at runtime and the `trigger_source` (`Manual`, `Page`, `Schedule`, `API`, `MCP`).
- **Auth events** carry IP, user agent, and outcome.

### Secret masking
The audit pipeline runs a final pass that replaces any substring matching a **Secret** [Global Variable](variables.md) with `[MASKED]` *before* writing to the database. The mask is immutable at the storage layer — there is no plaintext to recover.

> [!IMPORTANT]
> Masking is **value-based**, not field-based. Don't pick generic words as secret values; they will mask unrelated occurrences.

---

## 🔎 Filtering

The Audit Logs view supports:

- **User** — track a specific operator's actions.
- **Resource type** — isolate workflow changes when debugging.
- **Action** — e.g., only `Delete` events.
- **Trigger source** — separate scheduled runs from manual ones.
- **Date range** — narrow to an incident window.
- **Namespace** — split prod from staging.

For large environments, combine filters (e.g., `Workflow` + `Execute` + last 24h) to keep the result set fast.

---

## 🛠️ Step-by-step: investigate an incident

1. **Pinpoint the window** — when did the symptom appear?
2. **Open Audit Logs**, set the date range tightly around that window.
3. **Filter by resource** suspected (e.g., the workflow that misbehaved).
4. **Sort by time** and scan for `Update` / `Execute` entries.
5. Click an entry — review the `before`/`after` payload to see the exact diff.
6. Cross-reference the `who` with the **User** column; if it's an API key, check its assigned roles in [Roles](roles.md).
7. Capture screenshots / export the rows for your incident report.

---

## ✅ Best practices

- **Review on cadence** — weekly skim, monthly deep dive for compliance frameworks (SOC 2, ISO 27001).
- **Alert on patterns** — repeated `403` denials or off-hours `Execute` events should page someone.
- **Don't disable** audit logging "to speed things up"; the write cost is negligible compared to the forensic value.
- **Archive long-term** — depending on configuration, logs can rotate to external storage. Keep at least 12 months for compliance.

---

## 🧠 Reference

- **Storage** — dedicated append-only table; no `UPDATE` or `DELETE` paths in the application.
- **Retention** — configurable; older entries can be archived to S3/object storage.
- **Performance** — indexed by `(namespace, timestamp, resource_type)` for fast filtered scans.
- **Export** — the filtered view can be exported to CSV from the UI.

---

## 🔧 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| Expected event not in the log | Action happened in a different namespace | Switch the namespace filter; some events are recorded under the resource's namespace, not the user's. |
| Payload shows `[MASKED]` where you expect data | Field matched a Secret value | Confirm the variable; rotate the secret if accidentally leaked. |
| Logs growing too fast | Aggressive cron schedules + heavy `View` traffic | Reduce noisy `View` recording in settings; archive older entries. |
| Cannot see logs as auditor | Missing `audit:read` permission | Add `audit:read` to the auditor role (see [Roles](roles.md)). |
