# Implementation verification

Date: 2026-10-20 (Asia/Shanghai). Branch: `codex/canvas-project-organization`.
Validated application commit: `e4ae849`.
This report concerns the isolated feature worktree, not a production installation.

## Checks

| Check | Result |
|---|---|
| Complete Node test suite | 520 passed, zero failed/skipped |
| TypeScript | Passed |
| Locale consistency | Passed; 797 keys each in English, Chinese and Japanese |
| Production build | Passed; isolated production preview running on 3050 |
| Complete Playwright suite | 20 passed, zero failed/skipped; 1.5 minutes |
| Diff whitespace | Passed |

The Node suite includes the existing media/export tests. FFmpeg and ffprobe were
provided through test-process environment variables pointing to existing local
binaries; no model or production configuration was changed. Raw logs are in the
ignored worktree `data/organization-tests-final.log` and final build log.

## Material evidence

- Canvas v3 compatibility, canonical absolute frames, output references and
  generation snapshots survive v4 normalization, grouping and view changes.
  Ordinary generation cards keep restored sizes across runtime/Take updates.
- Pure projections hide output records in the existing Takes model. Aggregated
  edges never become generation references. Group movement translates members;
  resizing changes only the group frame; ungrouping retains every card.
- Distinct Asset pagination reaches records beyond 500 even when membership has
  duplicate categories. Folder removal previews promotion of children and Assets.
- Element references pin exact versions. Keep/adopt review is explicit; consumer
  navigation opens the owning Canvas group. Historical inputs and Timeline remain
  unchanged when the current reference changes.
- Separate SQLite processes compete at the same revision: exactly one CAS writer
  succeeds. Element binding/removal races leave no dangling references. Injecting
  a receipt-write failure rolls back both state and receipt.
- Template definitions use a strict reusable-content allowlist and explicit slots.
  Instances are independent idle drafts. Retries remain idempotent even after
  receipt expiry and template removal; cross-project references are rejected.
- Canvas preflight/submit checks source card, exact inputs, reviewed parameters,
  required slots and source digest. Changed inputs cannot reuse an old intent.
  No live provider inference was performed; execution-path tests use fixtures.
- HTTP/stdio MCP tests discover 40 tools, including eight organization tools.
  UI and MCP writes share the same revisioned transaction service.
- Organization scenarios assert zero generation jobs, upload intents and paid
  provider calls. They require no provider key.

## Browser fixture and review boundaries

The deterministic fixture contains 140 cards, eight named shot groups and four
support entries, 505 synthetic Assets, fixed-version Elements and a Timeline using
an older take with a nonzero source interval. Its PNG is a valid synthetic 16:9
image; no film material is included. See [quickstart.md](quickstart.md).

Scoped browser verification covers English/Chinese keyboard operation, overview
collapse/expand/reload, original-frame equality, all 112 output records, folders,
search past 500 results, stale-edit conflicts after an MCP write, Element version
review, UI template capture/save/insert and visibly blocked incomplete drafts.
The complete 20-case suite passed after the final cached-image correction. Both
English and Chinese narrow-screen drawers were verified for keyboard focus
confinement, Escape, focus return, saved folders and retained unsaved input.
The existing Projects creation tests now wait for an observable client-only mount
signal in the DEV harness before clicking SSR controls; no sleeps or click retries
were added. The original creation and retry assertions remain intact.

Screenshots in the ignored `test-results/` directory were visually inspected:
`organization-overview-en.png`, `organization-bilingual-en.png`,
`organization-bilingual-zh.png`, and `organization-mobile-drawer-{en,zh}.png`.
The overview contains eight groups plus four support entries and no stuck loading
overlay. These are synthetic development fixtures, not accepted film artwork.

Final Spec Kit convergence checked 23 functional requirements, seven success
criteria, 16 acceptance scenarios, eight technical decisions, five constitution
principles and all 36 tasks. No remaining actionable gap was found. The final
assessment left `tasks.md` byte-for-byte unchanged and found no extension hooks.

The production-build preview uses worktree data under `data/organization-preview`
on port 3050. Its fresh project is `d5b5570b-47d7-4eff-8d11-1877f1644545`:
[Chinese Canvas preview](http://127.0.0.1:3050/zh/canvas/d5b5570b-47d7-4eff-8d11-1877f1644545).
The user's connected Chrome opened this build, and its accessibility state
confirmed all eight groups, four supports and Chinese controls. Chrome's connected
screenshot API timed out; visual screenshot evidence comes from the completed
Playwright Chrome run. E2E temporary servers on 3042/3043 were stopped normally.
Production ports 3020/3031, real film projects, selected takes and model queues were
not modified by this implementation. Source checks and browser behavior do not
constitute human visual acceptance. Merge, deployment and real-project migration
remain separate steps.

General upstream tracking: [BeatDesign Issue 29](https://github.com/BeatAPI/BeatDesign/issues/29).
Implementation review: [fork draft PR 16](https://github.com/JaysonAlbert/BeatDesign/pull/16).
It has not been merged or accepted upstream. Later commits only complete this
verification/task record unless explicitly stated otherwise.

Automatic approval review rejected optional removal of two standalone synthetic
smoke-test Temp directories with `blocked by policy`. They remain retained; no
further cleanup or alternative deletion mechanism is planned.
