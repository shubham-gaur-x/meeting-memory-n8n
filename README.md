# Meeting Memory — n8n

Automatically turns meeting emails into structured Confluence notes and Jira tasks.

Reads your Gmail inbox, classifies emails using a rules-based scorer, extracts structured meeting data via Groq LLM, creates a rich Confluence page per meeting, and creates a Jira task per action item — routing high-priority ones straight into the active sprint.

---

## How It Works

```
Gmail Trigger (every 1 min)
    │
    ▼
Check Duplicate          ← skip already-processed emails (static data)
    │
    ▼
Classify Email           ← rules-based scorer, no LLM cost
    │ score >= 0.6
    ▼
Is Invite?               ← skip calendar invites (no content yet)
    │ not invite
    ▼
Build Groq Request       ← assembles prompt + email body
    │
    ▼
Groq LLM                 ← llama-3.3-70b-versatile, JSON mode
    │
    ▼
Parse LLM Response       ← extracts structured meeting data
    │ confidence >= 0.3
    ▼
Mark as Processed        ← write message ID to static data
    │
    ▼
Build Confluence Page    ← generates HTML with summary, decisions, action items
    │
    ▼
Create Confluence Page   ← space: SD
    │
    ▼
Expand Action Items      ← one n8n item per action item
    │
    ▼
Has Action Items?        ← skip Jira if none
    │ has items
    ▼
Create Jira Issue        ← project: SCRUM, type: Task
    │ if high priority
    ▼
Get Active Sprint        ← board 1
    │
    ▼
Add to Active Sprint     ← batch move to sprint
```

---

## Stack

| Layer | Tool |
|---|---|
| Workflow engine | [n8n cloud](https://n8n.io) |
| Email source | Gmail — native n8n OAuth2 node |
| LLM | [Groq](https://console.groq.com) — `llama-3.3-70b-versatile` (free tier) |
| Meeting notes | Confluence — space key `SD` |
| Tasks | Jira — project `SCRUM`, board `1`, issue type `Task` |
| Sprint routing | Jira Agile REST API |

---

## Repo Structure

```
workflows/
  meeting-memory.json         importable n8n workflow (18 nodes)
code-nodes/
  classifier.js               email meeting scorer (rules-based)
  build-groq-request.js       assembles Groq API request + system prompt
  parse-llm-response.js       parses Groq JSON → structured data
  check-duplicate.js          deduplication gate (reads static data)
  mark-processed.js           deduplication commit (writes static data)
  build-confluence-page.js    builds Confluence HTML from extracted data
  expand-action-items.js      splits one item → N items (one per action item)
scripts/
  build-workflow.js           regenerates meeting-memory.json from code-nodes/
docs/
  setup.md                    credential setup + import walkthrough
  superpowers/
    specs/                    feature design documents
    plans/                    implementation plans
```

---

## Setup

See [docs/setup.md](docs/setup.md) for the full walkthrough.

**Short version:**

1. Add 5 credentials in n8n (Gmail OAuth2, Groq Header Auth, Confluence, Jira, Jira Basic Auth)
2. Import `workflows/meeting-memory.json` into n8n
3. Connect credentials to each node
4. Send yourself a test meeting email and click **Test workflow**
5. Once verified, flip the **Active** toggle

---

## Modifying Code Nodes

All JavaScript lives in `code-nodes/`. After editing, regenerate the workflow JSON:

```bash
node scripts/build-workflow.js
```

Then re-import `workflows/meeting-memory.json` into n8n.

---

## Extracted Data Shape

The `_extracted` object passed between nodes:

```js
{
  title, kind, platform, date, start_time, end_time, duration_minutes,
  location, attendees, summary, topics, decisions, action_items,
  key_quotes, links, sentiment, follow_up_needed, confidence
}
// action_items entries: { owner, task, due, done, priority }
```

---

## Accounts (project-specific)

| Service | Value |
|---|---|
| n8n | `mvaiente.app.n8n.cloud` |
| Gmail | `shubham.gaur@onixnet.com` |
| Jira | `shubhamgaur1.atlassian.net`, project `SCRUM`, board `1` |
| Confluence | `shubhamgaur1.atlassian.net/wiki`, space `SD` |
