# Design: n8n Meeting Memory — Full Feature Parity

**Date:** 2026-05-12  
**Status:** Approved  
**Scope:** Bring the n8n workflow to full feature parity with the Python pipeline (`../n8n/`), fixing all known bugs and adding deduplication, invite filtering, and richer output.

---

## Background

The existing n8n workflow has 12 nodes and covers the happy path (Gmail → Groq → Confluence → Jira). Compared to the Python pipeline it is missing:

- **Deduplication** — same email re-processed on every poll cycle
- **Invite skip** — `kind=invite` emails (no content yet) waste a Groq API call
- **Confidence-gated state commit** — no record of what has been processed
- **Jira sentinel crash** — when no action items exist, the `_no_action_items` sentinel flows into the Jira Create node with `undefined` fields
- **Inline Confluence HTML** — 400-char template string embedded in workflow JSON, not in `code-nodes/`
- **Parser bug** — `if(ch='"')` uses assignment not equality in the JSON fallback walker
- **Live API key in docs** — Groq key hardcoded in `docs/setup.md` line 26
- **Code drift** — `code-nodes/` files and the inline JavaScript in the workflow JSON have diverged

---

## Goals

1. Fix all known bugs (parser, sentinel, API key exposure, code drift)
2. Add deduplication via n8n static data
3. Skip calendar invites before any LLM call
4. Extract Confluence HTML template to `code-nodes/build-confluence-page.js`
5. Enrich Jira issue descriptions with full meeting context + Confluence deep-link
6. Add a gating IF node before Jira to suppress the `_no_action_items` sentinel

---

## Non-Goals

- Assignee resolution (Jira user lookup by name) — deferred to a follow-up
- Obsidian vault integration (replaced by Confluence by design)
- Error alerting workflow (can be added after core is stable)

---

## Architecture

### Node map (17 nodes, was 12)

```
Gmail Trigger
  ↓
[NEW] Check Duplicate       Code node — static data lookup by message_id
  ↓ (new only)
Classify Email              Code node — rules-based scorer
  ↓
Is Meeting?                 IF: score >= 0.6
  ↓ (yes)
[NEW] Is Invite?            IF: kind === 'invite'
  ↓ (not invite)
Build Groq Request          Code node — assembles prompt
  ↓
Groq LLM                    HTTP Request → api.groq.com
  ↓
Parse LLM Response          Code node — BUG FIX: === in JSON fallback
  ↓
Confidence OK?              IF: confidence >= 0.3
  ↓ (ok)
[NEW] Mark as Processed     Code node — writes to static data
  ↓
[NEW] Build Confluence Page Code node — builds HTML from _extracted
  ↓
Create Confluence Page      Confluence node (space: SD)
  ↓
Expand Action Items         Code node — 1 item → N items
  ↓
[NEW] Has Action Items?     IF: !_no_action_items
  ↓ (has items)
Create Jira Issue           Jira node — richer description
  ↓
High Priority?              IF: _is_high_priority
  ↓ (high)
Get Active Sprint           HTTP GET — board 1
  ↓
Add to Active Sprint        HTTP POST — sprint assignment
```

**Dead-end branches** (no node on the false/stop side):
- `Check Duplicate` → duplicate detected → stop
- `Is Meeting?` → false → stop
- `Is Invite?` → true → stop
- `Confidence OK?` → false → stop
- `Has Action Items?` → false → stop
- `High Priority?` → false → stop (issue stays in backlog)

---

## Deduplication

### Mechanism

`$getWorkflowStaticData('global')` is a persistent object stored inside n8n cloud, scoped to this workflow. It survives across executions.

### Static data schema

```json
{
  "processed": {
    "<gmail_message_id>": {
      "processed_at": "2026-05-12T10:00:00Z",
      "kind": "recap",
      "confidence": 0.92
    }
  }
}
```

### Check Duplicate node logic

```js
const state = $getWorkflowStaticData('global');
state.processed = state.processed || {};
const msgId = $json.id || $json.messageId || '';
if (!msgId) return { json: $json }; // no ID → let through
if (state.processed[msgId]) {
  // Already processed — stop this branch silently
  // n8n stops execution when no items are returned
  return [];
}
return { json: { ...$json, _message_id: msgId } };
```

### Mark as Processed node logic

```js
const state = $getWorkflowStaticData('global');
state.processed = state.processed || {};
const msgId = $json._message_id || $json.id || $json.messageId || '';
if (msgId) {
  state.processed[msgId] = {
    processed_at: new Date().toISOString(),
    kind: $json._extracted?.kind || 'unknown',
    confidence: $json._extracted?.confidence || 0,
  };
}
return { json: $json };
```

---

## Invite Filtering

After `Is Meeting?` passes (score ≥ 0.6), a new `Is Invite?` IF node checks `$json._classification.kind === 'invite'`. The TRUE branch leads to a dead end; only the FALSE branch continues to the Groq call.

**Rationale:** Calendar invites have no meeting content yet — no summary, no decisions, no action items. Processing them burns a Groq API call and produces a near-empty Confluence page. The Python pipeline skips them for the same reason.

---

## Bug Fixes

### 1. Parser bug in Parse LLM Response

**File:** `code-nodes/parse-llm-response.js` and workflow JSON inline code  
**Bug:** `if(ch='"')` — assignment operator, always truthy. Should be `===`.  
**Fix:**
```js
// Before
if (ch='"') inStr = true;

// After
if (ch === '"') inStr = true;
```

### 2. `_no_action_items` sentinel crashes Jira node

**Fix:** New `Has Action Items?` IF node placed between `Expand Action Items` and `Create Jira Issue`:
```
Condition: {{ !$json._no_action_items }}  (boolean, falsy check)
```
When `_no_action_items` is `true`, the FALSE branch fires (dead end). When the field is absent (normal action item), the TRUE branch fires (continues to Jira).
The TRUE branch (has items) continues to Jira. The FALSE branch (no items) leads to a dead end.

### 3. Live Groq API key in docs

**File:** `docs/setup.md` line 26  
**Fix:** Replace the literal key `gsk_YOUR_GROQ_KEY_HERE` with the placeholder `gsk_YOUR_KEY_HERE`.

### 4. Code drift between code-nodes/ and workflow JSON

The workflow JSON inline code is a compressed/older copy. All four existing code files will be re-embedded verbatim into the workflow JSON as part of regenerating `meeting-memory.json`.

---

## New Code Node: Build Confluence Page

**File:** `code-nodes/build-confluence-page.js`

Extracts the Confluence HTML template from the workflow JSON into a maintainable code file.

### Output fields

```js
{
  _confluence_title: "2026-05-08 — Q3 Pricing Review w/ Alice",
  _confluence_body:  "<h2>Summary</h2>…"
}
```

### Page sections

| Section | Content |
|---|---|
| Summary | 2-4 sentence prose from `_extracted.summary` |
| Meeting Details | Table: date, platform, duration, sentiment, follow-up flag |
| Attendees | `<ul>` of name (email) — role |
| Decisions | `<ul>` of declarative sentences |
| Action Items | `<ul>` with `[HIGH]`/`[MED]`/`[LOW]` badge, owner, task, due date |
| Key Quotes | `<ul>` of up to 3 quotes (only if present) |
| Topics | Comma-separated kebab-case tags |
| Source Email | From / Date / Subject from email metadata |

HTML is escaped for `<`, `>`, `&` in all user-supplied fields to prevent Confluence rendering issues.

---

## Improved Jira Description

The `description` field on Create Jira Issue is updated to a multi-section plain-text format:

```
Meeting: {title}
Date: {date} | Platform: {platform} | Duration: {duration_minutes} min

Action Item:
{task}

Owner: {owner}  |  Due: {due}  |  Priority: {priority}

──────────────────────────────
Meeting Summary:
{summary}

Decisions:
• {decision1}
• {decision2}

Attendees:
• {name} ({email}) — {role}

──────────────────────────────
Confluence Note: {confluence_url}
Source: "{subject}" from {from} on {date}
```

Fields are gracefully omitted when null/empty (no "Owner: null" lines).

---

## File Changes Summary

| File | Change |
|---|---|
| `code-nodes/check-duplicate.js` | NEW |
| `code-nodes/mark-processed.js` | NEW |
| `code-nodes/build-confluence-page.js` | NEW |
| `code-nodes/parse-llm-response.js` | Fix `===` bug |
| `code-nodes/classifier.js` | No logic change; sync to workflow JSON |
| `code-nodes/build-groq-request.js` | No change; sync to workflow JSON |
| `code-nodes/expand-action-items.js` | No change; sync to workflow JSON |
| `workflows/meeting-memory.json` | Regenerate with 17 nodes, all inline code synced |
| `docs/setup.md` | Remove live API key |

---

## Testing Checklist

- [ ] Forward a Zoom recap email → Confluence page created, Jira issues created
- [ ] Re-forward the same email → workflow runs but no duplicate page/issues
- [ ] Forward a calendar invite → workflow stops at `Is Invite?`, no Groq call
- [ ] Forward a non-meeting email → workflow stops at `Is Meeting?`
- [ ] Forward a meeting email with no action items → Confluence page created, no Jira issues
- [ ] Forward a meeting email with a high-priority action item → issue appears in active sprint
