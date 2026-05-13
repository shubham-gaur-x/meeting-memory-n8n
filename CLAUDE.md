# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

n8n-based reimplementation of the meeting-memory pipeline. Replaces the Python pipeline in `../n8n/` with a visual n8n workflow. Reads Gmail, classifies meeting emails, extracts structured data via Groq LLM, creates a Confluence page per meeting, and creates Jira tasks for each action item (high-priority ones go to the active sprint).

**The original Python pipeline in `../n8n/` is untouched — this is a separate implementation.**

## Stack

| Layer | Tool |
|---|---|
| Workflow engine | n8n cloud — `mvaiente.app.n8n.cloud` |
| Email source | Gmail (native n8n node, no Composio) |
| LLM | Groq — `llama-3.3-70b-versatile` (free tier) |
| Meeting notes | Confluence — space key `SD` (Software Development) |
| Tasks | Jira — project `SCRUM`, board `1`, issue type `Task` |
| Sprint routing | Jira Agile REST API — high-priority action items → active sprint |

## Accounts & Config

- **n8n:** `mvaiente.app.n8n.cloud`
- **Gmail:** `shubham.gaur@onixnet.com`
- **Groq:** `llama-3.3-70b-versatile`, key stored in n8n credential `Groq API`
- **Jira domain:** `shubhamgaur1.atlassian.net`
- **Jira email:** `shubham.gaur@onixnet.com`
- **Jira project:** `SCRUM`, board `1`
- **Confluence space:** `SD` at `shubhamgaur1.atlassian.net/wiki`
- **Atlassian API token:** stored in n8n credentials `Confluence account`, `Jira account`, `Jira Basic Auth`

Do NOT hardcode API keys or tokens in any file.

## Folder Structure

```
workflows/
  meeting-memory.json       importable n8n workflow (all 12 nodes)
code-nodes/
  classifier.js             email meeting scorer (rules-based, no LLM)
  build-groq-request.js     assembles Groq API request body + system prompt
  parse-llm-response.js     parses Groq JSON → _extracted dataclass shape
  expand-action-items.js    splits one item into N items (one per action item)
docs/
  setup.md                  step-by-step credential setup + import guide
```

## n8n Workflow Node Map

```
Gmail Trigger → Classify Email → Is Meeting? (score >= 0.6)
  → Build Groq Request → Groq LLM → Parse LLM Response
  → Confidence OK? (>= 0.3)
  → Create Confluence Page (space: SD)
  → Expand Action Items (1 item → N items, one per action_item)
  → Create Jira Issue (project: SCRUM)
  → High Priority? → Get Active Sprint → Add to Active Sprint
```

## Key Design Decisions

- **No Composio** — Gmail trigger uses n8n's native OAuth2 node directly
- **Groq over Ollama** — n8n cloud can't reach localhost; Groq is free and has Llama 3.3 70B
- **Confluence over Obsidian** — Obsidian is local-only; Confluence is accessible to the whole team and links natively to Jira
- **`response_format: {type: "json_object"}`** — Groq supports this; forces valid JSON output, no markdown fence stripping needed
- **Expand Action Items node** — runs in "Run Once for All Items" mode, returns one n8n item per action item so the Jira node creates one ticket per item
- **Two Jira credentials** — native Jira node for issue creation; HTTP Basic Auth for the Agile API (sprint management) which uses a different base path (`/rest/agile/1.0/`)

## Priority Routing Logic

Implemented in `expand-action-items.js`:
- LLM sets `priority` field on each action item (`high|medium|low`)
- Fallback heuristic if no priority field: due ≤ 14 days → high, ≤ 60 days → medium, else low
- After Jira issue is created, `High Priority?` IF node routes to `Get Active Sprint` → `Add to Active Sprint`

## Extracted Data Shape

The `_extracted` object passed between nodes:
```js
{
  title, kind, platform, date, start_time, end_time, duration_minutes,
  location, attendees, summary, topics, decisions, action_items,
  key_quotes, links, sentiment, follow_up_needed, confidence
}
```
`action_items` entries: `{ owner, task, due, done, priority }`

## Setup

See `docs/setup.md` for the full credential setup and import walkthrough.
Short version:
1. Add 5 credentials in n8n (Gmail OAuth2, Groq Header Auth, Confluence, Jira, Jira Basic Auth)
2. Import `workflows/meeting-memory.json`
3. Connect credentials to each node
4. Test, then activate
