# BeatDesign Constitution

## Core Principles

### I. One Local Project Across Every Surface

Studio, Canvas, Editor, Assets, history and MCP MUST operate on the same local Project and
shared services. Import, organization, editing and export MUST remain usable without a remote
provider account. SaaS accounts, subscriptions, permissions and embedded general chatbots are
outside the product boundary.

### II. Assets and Exact Versions Are Authoritative

A node MUST reference real Assets, Generations or Timelines. Canvas organization MUST NOT
rewrite generation lineage. Clips MUST pin concrete Assets and source ranges; changing a
reference or displayed take MUST NOT silently replace existing clips or historical inputs.
Original media, prior takes and provenance MUST remain recoverable during organization.

### III. Shared Commands Enforce Every Write

UI and MCP MUST share validation, project ownership checks, revision protection, idempotency
and durable persistence through the Command Kernel. External agents MUST use incremental
semantic operations rather than replacing documents or writing SQLite directly. Conflicts
MUST be reported without silently discarding another writer's changes.

### IV. Local Organization Is Separate From Generation

Moving files into logical folders, naming references, grouping nodes, changing views and
instantiating templates MUST NOT submit model jobs, upload inputs or trigger paid work.
Generation MUST retain the existing explicit precheck/submission boundary. Credentials and
private runtime data MUST NOT enter source control or reusable templates.

### V. Verification and Completion Claims Must Match Evidence

Changes MUST have tests for material persistence, ownership and compatibility behavior.
Run typecheck, the repository test suite, i18n checks and build after application changes.
Canvas/persistence/MCP changes MUST also receive focused browser and MCP-to-UI verification.
Source completion, checks, preview, human visual acceptance, merge and deployment MUST be
reported separately; technical checks MUST NOT be called creative acceptance.

## Product and Compatibility Constraints

- Reuse React/TanStack Start, TypeScript, React Flow, the shared project model and local storage.
- Follow docs/DESIGN.md, accessible keyboard interaction and existing workspace vocabulary.
- Add user-visible messages in both English and Chinese; preserve existing locale fallback.
- Existing projects MUST open without automatic media deletion, take replacement or generation.
- No credentials, local database, generated media or film-specific production records in Git.
- These principles do not authorize restarting services, migrating live film data or publishing.

## Development Workflow and Review Gates

- Work on an isolated feature branch/worktree and stage only owned paths.
- Follow the initialized Spec Kit workflow: specification, specification review, plan, plan
  review, tasks, implementation and consistency/verification review.
- User instructions remain authoritative. Record explicit approval or waiver of a review gate;
  passage of time or an agent's self-review does not constitute user approval.
- Keep a reviewable isolated preview for visual changes before merge/default changes.
- Classify upstream contributions according to the user's repository instructions; reusable
  upstream changes require checking for duplicates and an Issue before an upstream PR.

## Governance

This constitution consolidates existing AGENTS.md and architecture rules for Spec Kit. It does
not supersede the user's instructions. Every plan MUST include a compliance check and justify
any exception before implementation. Amendments MUST state their rationale and impact: major
for incompatible principle changes, minor for new requirements, patch for clarifications.
Dependent documents read this constitution at runtime; do not rewrite official templates merely
to repeat it. Keep adoption and amendment dates explicit.

**Version**: 1.0.0 | **Ratified**: 2026-10-19 | **Last Amended**: 2026-10-19
