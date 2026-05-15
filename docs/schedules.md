# 📅 Schedules: Time-Triggered Automation

Schedules run workflows automatically on a cron expression — daily backups, hourly health checks, weekly reports — without any manual click.

![Schedules List](assets/schedules.png)
*Managing automated tasks in the Schedules overview.*

---

## 🌟 Overview

A **Schedule** binds three things:

```
Workflow  +  Cron expression  +  Preset inputs   =  Schedule
```

When the cron condition fires, CSM starts a new execution of the workflow using the preset inputs. The schedule can be toggled on/off without losing its configuration.

### When to use a Schedule
- **Recurring jobs** — backups, sync, cleanups, log rotation.
- **Off-hours runs** — heavy maintenance at 02:00.
- **Polling / health checks** — every N minutes.
- **One-off future runs** — fire once at a specific date/time.

For ad-hoc runs, use **Run Now** from the workflow list instead.

---

## ⚙️ Cron syntax (6 fields, with seconds)

```
┌───────── seconds (0-59)
│ ┌─────── minutes (0-59)
│ │ ┌───── hours   (0-23)
│ │ │ ┌─── day of month (1-31)
│ │ │ │ ┌─ month (1-12)
│ │ │ │ │ ┌ day of week (0-6, Sun-Sat)
│ │ │ │ │ │
*  *  *  *  *  *
```

### Useful examples
| Expression | Meaning |
| :--- | :--- |
| `0 */5 * * * *` | Every 5 minutes (at second 0) |
| `0 0 * * * *` | Every hour |
| `0 0 2 * * *` | Daily at 02:00 |
| `0 30 9 * * 1-5` | 09:30 every weekday |
| `0 0 0 1 * *` | First of every month at midnight |
| `0 0 12 * * 1` | Every Monday at noon |

The UI shows a live **Next run** preview so you can confirm the expression before saving.

---

## 🛠️ Configuration

| Field | What it controls |
| :--- | :--- |
| **Workflow** | The pipeline to fire. |
| **Type** | `RECURRING` (default) or `ONE_TIME`. |
| **Cron** | The trigger expression. |
| **Timezone** | Interprets the cron in that TZ; defaults to server TZ. |
| **Inputs** | Preset values handed to the workflow on every run. |
| **CatchUp** | If on, missed runs (while CSM was offline) execute on restart. |
| **Enabled** | Master switch — turn off without deleting. |

---

## 🚀 Lifecycle & behavior

- **Run Now** triggers immediately using the preset inputs and does **not** shift the next scheduled tick.
- **Concurrent runs** are allowed by default. If the previous execution is still running, a new one starts in parallel. To enforce serial execution, use the workflow's concurrency settings.
- **Failures** are logged in the [Audit Log](audit_logs.md) and `AFTER_FAILED` hooks fire as usual (see [Workflows — Hooks](workflows.md#-lifecycle-hooks)).
- **Persistence** — schedules live in the database and are reloaded into the cron runner whenever the service restarts or a schedule is modified.

---

## ✅ Best practices

- **Stagger heavy jobs** — don't run all nightly backups at `0 0 0 * * *` exactly; spread them across minutes to avoid CPU spikes.
- **Set Cleanup Files** on the workflow if the scheduled task generates temporary artifacts.
- **Use namespace-scoped variables** so the same workflow can run in staging vs. production by attaching different schedules.
- **Monitor with Audit Logs** — every scheduled trigger is recorded with `TriggerSource = Schedule`.

---

## 🛠️ Step-by-step: create a schedule

1. **Navigate** to Schedules → **+ New Schedule**.
2. **Pick a workflow** (must exist already; see [Workflows](workflows.md)).
3. **Enter the cron** expression; confirm the "Next run" preview.
4. **Fill preset inputs** for the workflow.
5. (Optional) Toggle **CatchUp** if you want missed runs to fire after downtime.
6. **Save** — the schedule is live immediately. Toggle off if you need a pause.
7. (Optional) Click **Run Now** to test without waiting for the next tick.

---

## 🔧 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| Schedule never fires | Wrong timezone; enabled toggle off | Check the TZ field; verify "Next run" preview matches expectation. |
| Two runs at the same minute | Multiple overlapping cron expressions or concurrent triggers | Consolidate schedules or enforce concurrency limits in the workflow. |
| Missed runs after restart | CatchUp disabled | Enable **CatchUp** if you need backfill behavior. |
| Inputs differ between manual and scheduled runs | Manual run dialog overrides preset inputs | Re-save the schedule with the desired preset values. |
