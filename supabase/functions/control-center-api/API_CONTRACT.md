# Control Center API — Contract

**Endpoint**: `POST /functions/v1/control-center-api`  
**Auth**: `Authorization: Bearer <CC_TAX_API_KEY>`

## Actions

| Action | Table(s) | Returns |
|---|---|---|
| `get_workflow_status` | `workflow_states` | `{ workflow_status }` — latest row (or filtered by `tax_year`) |
| `get_year_config` | `tax_year_configs` + `state_configs` | `{ year_config }` — config with nested state configs |
| `get_documents` | `documents` | `{ documents[], total }` |
| `get_transactions` | `transactions` | `{ transactions[], counts_by_state, total_amount }` |
| `get_evidence` | `evidence` | `{ evidence[], total }` |
| `get_invoices` | `invoices` | `{ invoices[], total_invoiced, count }` |
| `get_reconciliations` | `income_reconciliations` | `{ reconciliations[], unreconciled_count }` |
| `get_discrepancies` | `discrepancies` | `{ discrepancies[], unresolved_count, by_severity }` |
| `get_pl_report` | `pl_reports` | `{ pl_report }` — latest report |

## Common params

| Param | Type | Description |
|---|---|---|
| `action` | string | **Required**. One of the actions above. |
| `tax_year` | number | Optional. Filters by tax year. |
| `status_filter` | string | Optional. Filters by status/state/severity. |
| `limit` | number | Optional. Max rows returned (default 200). |

## Notes

- RLS is **disabled** on `documents`, `transactions`, `pl_reports` to allow external writes via anon key.
- Other tables have permissive "allow all" RLS policies.
- Auth is **not** JWT-based; it uses a shared secret (`CC_TAX_API_KEY`).
- This project has no `tax_returns` table. Control Center's `tax_returns` is a separate concept.
