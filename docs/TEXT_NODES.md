# Text nodes (local fork)

Text nodes store plain text in the project Canvas document. They are not media
Assets and do not require a provider account. The text can contain scripts,
character descriptions, storyboard prompts or notes. Each node has an editable
title, purpose and body (up to 100,000 characters), and supports normal Canvas
placement, resizing, copying, deletion, undo/redo and persistence.

## UI

1. In Canvas, click the **Add text node** document icon in the left toolbar.
2. Edit the title, select the purpose and write the body. Changes save locally.
3. Open an image, video or analysis generation node. In its reference picker,
   select the text from **From Canvas**, or connect the text output to the node.
4. Attached documents get separate `@Text1`, `@Text2`, etc. aliases. Clicking a
   reference chip inserts its alias. Multiple generation nodes can share a text.

Every attached text document is included in the prompt context, whether or not
its alias is mentioned. Text does not consume image/video reference slots or
change `@ImageN`/`@VideoN` numbering. The selected model's limit applies to the
**combined** prompt; a long document may be editable but too long for that model.
Empty documents and missing text aliases fail before generation. This is context
assembly, not an LLM summarizer. Referenced content is sent to the selected model;
with a local model it stays local, and with a remote model it is part of the
confirmed remote request.

Generation output snapshots preserve document IDs, titles, purposes, original
bodies and the resolved prompt. History also stores the original prompt and
the referenced document snapshots. Server preflight verifies project ownership
and rejects stale/forged text snapshots before uploading or generating. Editing
a document changes future requests; it does not rewrite older takes.

## MCP

Existing tools expose the same document and Command Kernel as the UI:

- `bdesign_canvas_get`: read text nodes and full bodies (`kind: "text"`).
- `bdesign_canvas_search`: filter `kind`/`type` by `"text"`, and search titles,
  bodies or purposes.
- `bdesign_canvas_apply`: create/patch with `upsert_text`; move, place, remove,
  reference and inspect revisions using the normal Canvas operations.

Example operations passed to `bdesign_canvas_apply`:

```json
[
  {
    "type": "upsert_text",
    "cardId": "character-sloth",
    "name": "Sloth character",
    "textRole": "character",
    "textContent": "A brown sloth wearing a red scarf. Keep these details in every shot."
  },
  { "type": "place_card", "cardId": "character-sloth" },
  {
    "type": "set_references",
    "cardId": "existing-generation-node",
    "referenceCardIds": ["character-sloth", "existing-image-node"]
  }
]
```

`set_references` sets the whole reference list, so preserve existing media IDs.
Patch only the intended field with `upsert_text`; stable command IDs, revisions
and idempotency keys behave as for other Canvas commands. Text purposes are
`note`, `script`, `character` and `storyboard`. No new MCP tool name is required.

This first version has no rich-text renderer, automatic script generation,
nested text references, or separate text version browser. Generation snapshots
preserve the versions actually used.

## Local validation (2026-10-17)

The feature was developed from `ac4bdfa` on `codex/text-nodes`, retaining the
local H3/Drama 3 adapters. Its preview uses a separate project database and web
port 3022, leaving the existing port 3020 instance and dirty source worktree
untouched. Automated checks cover persistence, text aliases, prompt assembly,
frozen snapshots, project boundaries, stale content, combined prompt limits and
UI/MCP service parity. Browser/MCP checks use a dedicated sample project and do
not invoke paid generation or GPU inference.

Final checks: typecheck, i18n check and production build passed. The complete
suite has 429 tests: 427 passed and 2 skipped. Real stdio MCP verified creation,
body reads, field edits and full-text search. Browser checks verified creating
and editing a text node, refresh persistence, choosing text references, visible
reference edges, and two live MCP-to-UI body updates. The isolated HTTP MCP on
port 3033 also passed handshake, schema discovery and text search. Screenshot:
`data/text-nodes-preview.jpg`. No model inference was performed in this check.
