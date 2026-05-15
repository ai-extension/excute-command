# 🔐 Roles & Permissions: RBAC

CSM uses fine-grained Role-Based Access Control so each user sees only what they need. Permissions are namespace-scoped — a `prod` admin has no power in `staging` unless explicitly granted.

![Roles List](assets/roles.png)
*Defining access levels in the Roles overview.*

---

## 🌟 Overview

```
Permission  →  smallest "can-do" unit (workflow:execute, server:write, audit:read, …)
Role        →  named bundle of permissions (Deployer, Auditor, Operator, …)
User        →  has one or more Roles; effective rights = union of all their roles
Namespace   →  tenancy boundary; a Role applies inside its namespace only
```

A user attempting an action is allowed iff at least one of their roles in the action's namespace grants the required permission.

### When to design a new Role
- A team member needs **just enough** rights for one workflow (don't grant Super Admin).
- A new persona joins (auditor, operator, ops engineer).
- You want to **restrict by item** — e.g., one user can run only `deploy-staging`, not `deploy-prod`.

---

## ⚙️ Permission model

### Action types
| Action | Means |
| :--- | :--- |
| **`READ`** | View lists and details. |
| **`WRITE`** | Create or modify resources. |
| **`EXECUTE`** | High-impact action — run a workflow, fire a schedule. |

### Permission scopes
- **`FUNCTION`** — system-level capabilities (`audit:read`, `system:settings`).
- **`RESOURCE`** — object-level capabilities (`workflow:execute`, `server:write`, `page:read`).

### Item-level restriction
A role can be **Global** (all items of a resource type) or **Item-scoped** via `AllowedItemIDs`. Item-scoping is great for limiting a deploy operator to specific workflows while hiding others in the same namespace.

---

## 🧑‍💼 Common persona templates

| Persona | Permissions (suggested) |
| :--- | :--- |
| **Super Admin** | All `FUNCTION` + all `RESOURCE` permissions across all namespaces. |
| **Workflow Author** | `workflow:read,write` ; `server:read` ; `variable:read,write` ; `page:read,write`. |
| **Deploy Operator** | `workflow:execute` (item-scoped to release workflows) ; `page:read`. |
| **Auditor** | `audit:read` ; `workflow:read` ; `server:read` ; `schedule:read`. |
| **AI Integrator** | API keys with `mcp:enable` ; per-namespace `workflow:read,execute`. |

---

## 🔒 Resolution flow

When a user clicks **Run** on a workflow:

1. Backend reads all roles attached to the user.
2. Filters to roles within the workflow's namespace.
3. Checks if any role grants `workflow:execute`.
4. If the role is item-scoped, checks `AllowedItemIDs` contains the workflow's id.
5. Allowed → executes; not allowed → `403 Forbidden` (and an entry in the [Audit Log](audit_logs.md)).

---

## ✅ Best practices

- **Principle of least privilege** — start with no permissions and add only what's blocked.
- **Audit assignments quarterly** — review the role-user matrix in [Audit Logs](audit_logs.md).
- **Separate `prod` and `staging`** into different namespaces; copy roles but not assignments.
- **Reserve Super Admin** for emergency operations and the initial bootstrap user.
- **Use item scoping** for deploy / production workflows — far safer than namespace-wide `workflow:execute`.

---

## 🛠️ Step-by-step: create a role

1. **Navigate** to Roles → **+ New Role**.
2. **Name** — descriptive, matches the persona (e.g., `Deploy Operator`).
3. **Namespace** — pick the scope (or leave global if applicable).
4. **Add permissions** — tick the action × resource cells in the matrix.
5. (Optional) **Item-scope** — for any `workflow:execute` or similar, pick the specific item IDs.
6. **Save**. The role appears in the user assignment dialog immediately.

### Assigning a role to a user
- Users → pick a user → **Roles** tab → add the role.
- Changes take effect on the user's next API call (no logout required).

---

## 🧠 Reference

- **Default Super Admin** — created at install; has all bits enabled across all namespaces. Treat like a `root` account.
- **Permission storage** — roles are stored as a permission bitmap per resource type, plus an optional `AllowedItemIDs` array.
- **API keys** can have their own permission subset (a sub-role) — useful for limited automation tokens (see [MCP](mcp.md)).
- **Cross-namespace actions** are always denied unless an explicit role grants permission in *each* namespace separately.

---

## 🔧 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| User gets `403` on a workflow they should run | Role is item-scoped and workflow id not in `AllowedItemIDs` | Add the id, or grant the role globally. |
| New role doesn't apply | Role assigned but cached session | Refresh the page; for API keys, regenerate or wait for cache TTL. |
| Auditor can't see audit logs | Missing `audit:read` permission | Add the `FUNCTION` permission `audit:read` to the auditor role. |
| Permission bleeds across environments | Same role assigned in multiple namespaces | Split into per-namespace roles; review the namespace column in the assignment table. |
