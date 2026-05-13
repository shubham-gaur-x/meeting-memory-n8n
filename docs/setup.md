# Setup Guide — Meeting Memory n8n

## Prerequisites

- n8n cloud account at `mvaiente.app.n8n.cloud`
- Gmail account: `shubham.gaur@onixnet.com`
- Groq API key (free): `console.groq.com`
- Jira: `shubhamgaur1.atlassian.net`, project `SCRUM`, board `1`
- Confluence: `shubhamgaur1.atlassian.net/wiki`, space key `SD`

---

## Step 1 — Add Credentials in n8n

Go to **n8n → Settings → Credentials → Add credential** and create each of the following.

### 1a. Gmail OAuth2
- Type: `Gmail OAuth2`
- Follow the OAuth flow to connect `shubham.gaur@onixnet.com`

### 1b. Groq API (HTTP Header Auth)
- Type: `Header Auth`
- Name: `Groq API`
- Name field: `Authorization`
- Value field: `Bearer gsk_YOUR_GROQ_KEY_HERE`

### 1c. Confluence
- Type: `Confluence API`
- Name: `Confluence account`
- Host: `https://shubhamgaur1.atlassian.net/wiki`
- Email: `shubham.gaur@onixnet.com`
- API token: *(same Atlassian token as Jira)*

### 1d. Jira Software Cloud
- Type: `Jira Software Cloud API`
- Name: `Jira account`
- Host: `https://shubhamgaur1.atlassian.net`
- Email: `shubham.gaur@onixnet.com`
- API token: *(your Atlassian API token)*

### 1e. Jira Basic Auth (for Agile/Sprint API)
- Type: `HTTP Basic Auth`
- Name: `Jira Basic Auth`
- User: `shubham.gaur@onixnet.com`
- Password: *(your Atlassian API token)*

---

## Step 2 — Import the Workflow

1. In n8n, click **+ New workflow**
2. Click the **⋯ menu** (top right) → **Import from file**
3. Select `workflows/meeting-memory.json`
4. The workflow loads with all nodes. Credential fields will show a warning — fix them in Step 3.

---

## Step 3 — Connect Credentials to Nodes

After importing, click each node that has a credential warning and select the matching credential you created in Step 1:

| Node | Credential to select |
|---|---|
| Gmail Trigger | `Gmail account` |
| Groq LLM | `Groq API` |
| Create Confluence Page | `Confluence account` |
| Create Jira Issue | `Jira account` |
| Get Active Sprint | `Jira Basic Auth` |
| Add to Active Sprint | `Jira Basic Auth` |

---

## Step 4 — Test the Workflow

1. Click **Test workflow** (top right)
2. Send yourself a meeting-related email (forward a Zoom recap or calendar invite to your Gmail)
3. Watch the execution — each node turns green as it processes
4. Check:
   - Confluence `SD` space for the new meeting page
   - Jira `SCRUM` backlog for new task(s)
   - High-priority tasks should appear in the active sprint

---

## Step 5 — Activate

Once testing passes, click the **Active** toggle (top right of the workflow). The Gmail Trigger will now poll every minute automatically.

---

## Workflow Overview

```
Gmail Trigger (every 1 min)
    │
    ▼
Classify Email          ← rules-based, no LLM cost
    │ score >= 0.6
    ▼
Build Groq Request      ← assembles prompt + email body
    │
    ▼
Groq LLM                ← llama-3.3-70b-versatile, JSON mode
    │
    ▼
Parse LLM Response      ← extracts structured meeting data
    │ confidence >= 0.3
    ▼
Create Confluence Page  ← space: SD
    │
    ▼
Expand Action Items     ← splits into one n8n item per action item
    │
    ▼
Create Jira Issue       ← project: SCRUM, type: Task
    │ if high priority
    ▼
Get Active Sprint       ← board 1
    │
    ▼
Add to Active Sprint    ← batch move to sprint
```

---

## Troubleshooting

**Gmail Trigger not firing**
- Check OAuth2 credential is connected
- Ensure the workflow is set to Active

**Groq returns an error**
- Verify the `Authorization` header value starts with `Bearer `
- Check Groq dashboard for rate limit status

**Confluence page not created**
- Confirm space key is exactly `SD` (case-sensitive)
- Verify the Confluence credential host includes `/wiki`

**Jira issue not appearing**
- Check the project key is `SCRUM`
- Ensure the issue type `Task` exists in that project

**Sprint assignment failing**
- The `Get Active Sprint` node requires an active sprint on board `1`
- If no active sprint exists, this step will error but the Jira issue is still created in the backlog
