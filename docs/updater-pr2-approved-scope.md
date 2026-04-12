# Updater — PR-2 approved scope

Status: **approved** (implementation-ready).  
Builds on PR-1 (release visibility, operator runbook). Execution stays **outside** the main CRM backend.

## What PR-2 includes

- **`scripts/operator/`** (or equivalent path): operator-facing shell scripts and helper docs.
- **Documentation** updates: operator-driven update/rollback, how to run preflight/apply safely.

## Hard constraints

1. **Scripts + docs only** for this PR.  
   - **No** new backend or web API routes.  
   - **No** UI changes (including Settings / Release block).

2. **`preflight.sh` — strictly read-only**  
   - Only checks, stdout/stderr, and exit code.  
   - **No side effects** (no writes, no `docker compose up`, no image pulls, no file mutations).

3. **`apply.sh` — explicit operator confirmation**  
   - Must require a clear flag (e.g. `--yes` or `--i-understand`) to perform any mutating / apply action.  
   - **No** implicit or default “just run” behavior that changes the deployment.

## Out of scope (unchanged)

- Main backend must **not** control `docker compose` or invoke shell for upgrades.
- **No** auto-update, **no** sidecar/container updater in PR-2.
- **No** fleet management, customer portal, billing, or licensing work in this PR.
- **Rollback-first** remains **documented** and **operator-driven** (images + DB backup policy); no automated rollback engine in the app.

## Execution model

- **Pure operator script flow** on the host (SSH / documented procedure).  
- Privileged steps live only in repo scripts run by the operator, not inside Nest.
