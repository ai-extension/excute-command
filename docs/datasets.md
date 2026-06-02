# 🗂️ Datasets: Structured Data Store

Datasets let you store **structured, multi-row data** inside CSM — allow-lists, host inventories, feature flags, lookup tables — and read or mutate that data **from within a workflow run** through a dedicated Dataset step.

---

## 🌟 Overview

A **Global Variable** holds one value. A **Dataset** holds a *collection of records* — think of it as a lightweight table scoped to a namespace.

- **Dataset** — the collection. Has a `key` (used to pick it in a step), a `name`, and an optional **column hint**.
- **Record** — one row. Stored as a free-form JSON object; the schema is **loose** (any fields allowed).

Workflows never reference a dataset directly in a command template. Instead a **Dataset step** (`action_type = DATASET`) performs an operation and writes its JSON result into the flow, where later steps read it via `{{ flow.<group>.step.<action_key> }}`.

### When to use a Dataset
- A workflow needs a **list** of things (servers, users, tenants) it loops over.
- You maintain an **allow-list / block-list** that operators edit in the UI without touching the workflow.
- A workflow must **record state** between runs (e.g., mark an item processed).

For a single shared value, use a [Global Variable](variables.md) instead.

---

## ⚙️ Anatomy

### Dataset
| Field | Purpose |
| :--- | :--- |
| **Key** | Identifier used to select the dataset in a step. Cannot change after creation. |
| **Name** | Human-friendly label. |
| **Description** | Optional note. |
| **Columns** | *Optional* JSON array `[{"name","type"}]`. **UI hint only** — used for table headers and the record form; never enforced. |
| **Namespace** | Hard isolation, like every other resource. |

### Record
| Field | Purpose |
| :--- | :--- |
| **Data** | Arbitrary JSON object — the row payload. |
| **_id** | System field injected into query results so steps can target a row precisely. |

> [!NOTE]
> The schema is intentionally **loose**. Columns are a convenience for the UI; a record may contain any keys regardless of the column hint.

---

## 🖥️ Managing data in the UI

1. **Datasets** page → **+ Add Dataset** → set Key, Name, (optional) Columns.
2. On a dataset row, click **Manage Records** to open the record grid.
3. Add / edit / delete rows. Each record is edited as a JSON object; the create form pre-fills keys from the column hint.

---

## 🧩 The Dataset step

Add a step in the workflow designer and set its **Type** to **Dataset**. Pick the dataset and an **operation**.

Both **Filter** and **Payload** are Pongo2 templates — they can embed `{{ input.x }}`, `{{ global.x }}`, or `{{ flow.<group>.step.<key> }}` from earlier steps.

| Operation | What it does | Result (JSON) |
| :--- | :--- | :--- |
| **Find Many** (`QUERY`) | Load records, apply the filter, cap to `limit`. | Array of records: `[{ "_id": "…", … }]` |
| **Find One** (`FIND_ONE`) | Return the first record matching the filter. | A single record object, or `null` if none. |
| **INSERT** | Create one record (object) or many (array). | The created record(s), with `_id`. |
| **UPDATE** | Match by filter, **merge** the payload into each match. Supports [update operators](#update-operators) like `$inc`. | `{ "affected": n, "ids": [...] }` |
| **DELETE** | Match by filter, delete each. | `{ "affected": n, "ids": [...] }` |

> [!IMPORTANT]
> **UPDATE and DELETE require a non-empty filter** — a guard against wiping the whole dataset by accident. **UPDATE merges** (existing fields are preserved); it does not replace the row.

### Update operators

By default an UPDATE field is a **literal set** — `{"active": false}` writes `false`. To compute a new value from the row's **current** value, use an operator object instead of a literal.

| Operator | Payload | Effect |
| :--- | :--- | :--- |
| `$inc` | `{"count": {"$inc": 1}}` | Add `1` to `count` on each matched row. Use a negative number to decrement. |

```json
{"status": "done", "retries": {"$inc": 1}, "stock": {"$inc": -1}}
```

- A **missing or null** target field counts as `0`, so `$inc` initializes it (`{"$inc": 1}` on an absent field → `1`).
- The target must be **numeric** (or absent); a non-numeric current value fails the step.
- `$inc` is **UPDATE-only** — using it in an INSERT payload is an error.
- The delta may be a template: `{"$inc": {{ input.qty }}}`.

> [!NOTE]
> **`$inc` is atomic.** The increment is computed from the live database value in a single statement, so two concurrent runs incrementing the same row will **not** lose an update. A plain literal set still overwrites the whole field, so prefer `$inc` for counters. (Reading a value in one step and writing `value + 1` back in a later step is **not** atomic — use `$inc`.)

### Filter syntax
Comma-separated conditions, matched against each record's fields:

```
role=admin,active=true
age>=18
name~smith        # ~ = contains
status!=archived
```

Operators: `=  !=  >  <  >=  <=  ~`. Numeric values compare numerically; everything else is string-compared.

### Capturing the result
A Dataset step's JSON output is captured into the flow **only when** the step has an **Action Key** set and **Output Format = JSON** (the default). Later steps then read it.

---

## 🪜 Worked example

```
Group "main"
├── Step  admins   (DATASET / QUERY)
│      dataset: users   filter: role=admin
│      → flow.main.step.admins = [{"_id":"…","email":"a@x.com"}, …]
│
├── Step  notify   (COMMAND)
│      echo "Admins: {{ flow.main.step.admins | pluck:'email' | json }}"
│
└── Step  disable  (DATASET / UPDATE)
       dataset: users   filter: id={{ input.target_id }}
       payload: {"active": false}
       → flow.main.step.disable = {"affected":1,"ids":["…"]}
```

Because QUERY returns `[]map`, all the existing list filters apply to its output:

| Goal | Template |
| :--- | :--- |
| All rows | `{{ flow.main.step.admins \| json }}` |
| Filter again | `{{ flow.main.step.admins \| filter_by:"active=true" \| json }}` |
| Find one | `{{ flow.main.step.admins \| find:"_id=…" \| attr:"email" }}` |
| Extract a column | `{{ flow.main.step.admins \| pluck:"email" \| json }}` |
| Count | `{{ flow.main.step.admins \| length }}` |

---

## 🔒 Security

- **Namespace isolation** — a Dataset step only reaches datasets in the running workflow's namespace.
- **RBAC** — guarded by the `datasets` permission (READ / WRITE / DELETE).
- **Shell injection** — when you embed queried data into a COMMAND, pass it through `| shellquote` or `| json`. Dataset values are **not** character-filtered like secrets, because that would corrupt structured data.
- **Audit** — record mutations during a run are written to the execution's step log.

---

## ✅ Best practices

- **Pick a stable `key`** — it's referenced in steps and cannot be renamed.
- **Always filter UPDATE/DELETE** — and prefer matching on `_id` for single-row precision.
- **Cap large QUERYs** — set an explicit `limit`; the default cap is 10,000 records.
- **Keep records small** — datasets are not a blob store; use [Workflow Files](workflows.md#-workflow-files) for large artifacts.

---

## 🔧 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| `{{ flow.G.step.K }}` is empty | Step missing an **Action Key**, or Output Format not JSON | Set both on the Dataset step. |
| QUERY returns `[]` unexpectedly | Filter typo or wrong value type | Check operator/casing; numbers vs strings. |
| `UPDATE requires a non-empty filter` error | UPDATE/DELETE with blank filter | Provide a filter (e.g. `_id=…`). |
| Records missing fields you expected | Loose schema — the row simply never had that key | Edit the record in the UI grid. |
| Dataset not in the step dropdown | Wrong namespace, or no `datasets` READ permission | Confirm namespace and role. |
