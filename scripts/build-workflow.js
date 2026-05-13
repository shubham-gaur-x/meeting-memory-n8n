#!/usr/bin/env node
// scripts/build-workflow.js
// Reads code-nodes/ files and generates workflows/meeting-memory.json.
// Run: node scripts/build-workflow.js

'use strict';
const fs   = require('fs');
const path = require('path');

const root      = path.join(__dirname, '..');
const codeDir   = path.join(root, 'code-nodes');
const outputPath = path.join(root, 'workflows', 'meeting-memory.json');

function code(filename) {
  const fullPath = path.join(codeDir, filename);
  if (!fs.existsSync(fullPath)) {
    console.error(`ERROR: code-nodes/${filename} not found`);
    process.exit(1);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

const workflow = {
  name: 'Meeting Memory',
  nodes: [
    // ── 1. Gmail Trigger ──────────────────────────────────────────────────
    {
      parameters: {
        pollTimes: { item: [{ mode: 'everyMinute' }] },
        filters: {},
        options: {}
      },
      id: 'node-gmail-trigger',
      name: 'Gmail Trigger',
      type: 'n8n-nodes-base.gmailTrigger',
      typeVersion: 1,
      position: [0, 300],
      credentials: { gmailOAuth2: { id: '', name: 'Gmail account' } }
    },

    // ── 2. Check Duplicate (NEW) ──────────────────────────────────────────
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: code('check-duplicate.js') },
      id: 'node-check-duplicate',
      name: 'Check Duplicate',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 300]
    },

    // ── 3. Classify Email ─────────────────────────────────────────────────
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: code('classifier.js') },
      id: 'node-classify',
      name: 'Classify Email',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [440, 300]
    },

    // ── 4. Is Meeting? ────────────────────────────────────────────────────
    {
      parameters: {
        conditions: {
          number: [{ value1: '={{ $json._classification.score }}', operation: 'largerEqual', value2: 0.6 }]
        }
      },
      id: 'node-if-meeting',
      name: 'Is Meeting?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [660, 300]
    },

    // ── 5. Is Invite? (NEW) ───────────────────────────────────────────────
    {
      parameters: {
        conditions: {
          string: [{ value1: '={{ $json._classification.kind }}', operation: 'equal', value2: 'invite' }]
        }
      },
      id: 'node-is-invite',
      name: 'Is Invite?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [880, 300]
    },

    // ── 6. Build Groq Request ─────────────────────────────────────────────
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: code('build-groq-request.js') },
      id: 'node-build-groq',
      name: 'Build Groq Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1100, 180]
    },

    // ── 7. Groq LLM ───────────────────────────────────────────────────────
    {
      parameters: {
        method: 'POST',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        contentType: 'json',
        body: '={{ JSON.stringify($json._groq_body) }}',
        options: { timeout: 60000 }
      },
      id: 'node-groq',
      name: 'Groq LLM',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [1320, 180],
      credentials: { httpHeaderAuth: { id: '', name: 'Groq API' } }
    },

    // ── 8. Parse LLM Response (FIXED: ===, _message_id forwarded) ─────────
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: code('parse-llm-response.js') },
      id: 'node-parse',
      name: 'Parse LLM Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1540, 180]
    },

    // ── 9. Confidence OK? ─────────────────────────────────────────────────
    {
      parameters: {
        conditions: {
          number: [{ value1: '={{ $json._extracted.confidence }}', operation: 'largerEqual', value2: 0.3 }]
        }
      },
      id: 'node-if-confidence',
      name: 'Confidence OK?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [1760, 180]
    },

    // ── 10. Mark as Processed (NEW) ───────────────────────────────────────
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: code('mark-processed.js') },
      id: 'node-mark-processed',
      name: 'Mark as Processed',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1980, 180]
    },

    // ── 11. Build Confluence Page (NEW) ───────────────────────────────────
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: code('build-confluence-page.js') },
      id: 'node-build-confluence',
      name: 'Build Confluence Page',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2200, 60]
    },

    // ── 12. Create Confluence Page (title + content from code node) ───────
    {
      parameters: {
        resource: 'page',
        operation: 'create',
        spaceKey: 'SD',
        title: '={{ $json._confluence_title }}',
        content: '={{ $json._confluence_body }}',
        additionalFields: {}
      },
      id: 'node-confluence',
      name: 'Create Confluence Page',
      type: 'n8n-nodes-base.confluence',
      typeVersion: 1,
      position: [2420, 60],
      credentials: { confluenceApi: { id: '', name: 'Confluence account' } }
    },

    // ── 13. Expand Action Items ───────────────────────────────────────────
    {
      parameters: { mode: 'runOnceForAllItems', jsCode: code('expand-action-items.js') },
      id: 'node-expand',
      name: 'Expand Action Items',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2640, 60]
    },

    // ── 14. Has Action Items? (NEW) ───────────────────────────────────────
    {
      parameters: {
        conditions: {
          boolean: [{ value1: '={{ !$json._no_action_items }}', value2: true }]
        }
      },
      id: 'node-has-action-items',
      name: 'Has Action Items?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [2860, 60]
    },

    // ── 15. Create Jira Issue (richer description) ────────────────────────
    {
      parameters: {
        resource: 'issue',
        project: { key: 'SCRUM' },
        issuetype: { name: 'Task' },
        summary: '={{ $json._jira_summary }}',
        additionalFields: {
          priority: {
            name: "={{ $json._priority === 'high' ? 'High' : $json._priority === 'medium' ? 'Medium' : 'Low' }}"
          },
          labels: '={{ $json._jira_labels }}',
          duedate: '={{ $json._jira_due_date }}',
          description: '={{ $json._jira_description }}'
        }
      },
      id: 'node-jira',
      name: 'Create Jira Issue',
      type: 'n8n-nodes-base.jira',
      typeVersion: 1,
      position: [3080, 60],
      credentials: { jiraSoftwareCloudApi: { id: '', name: 'Jira account' } }
    },

    // ── 16. High Priority? ────────────────────────────────────────────────
    {
      parameters: {
        conditions: {
          boolean: [{ value1: '={{ $json._is_high_priority }}', value2: true }]
        }
      },
      id: 'node-if-priority',
      name: 'High Priority?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [3300, 60]
    },

    // ── 17. Get Active Sprint ─────────────────────────────────────────────
    {
      parameters: {
        method: 'GET',
        url: 'https://shubhamgaur1.atlassian.net/rest/agile/1.0/board/1/sprint',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
        sendQuery: true,
        queryParameters: { parameters: [{ name: 'state', value: 'active' }] },
        options: {}
      },
      id: 'node-get-sprint',
      name: 'Get Active Sprint',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [3520, -60],
      credentials: { httpBasicAuth: { id: '', name: 'Jira Basic Auth' } }
    },

    // ── 18. Add to Active Sprint ──────────────────────────────────────────
    {
      parameters: {
        method: 'POST',
        url: "={{ 'https://shubhamgaur1.atlassian.net/rest/agile/1.0/sprint/' + $('Get Active Sprint').item.json.values[0].id + '/issue' }}",
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
        sendBody: true,
        contentType: 'json',
        body: "={{ JSON.stringify({ issues: [$('Create Jira Issue').item.json.key] }) }}",
        options: {}
      },
      id: 'node-add-sprint',
      name: 'Add to Active Sprint',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [3740, -60],
      credentials: { httpBasicAuth: { id: '', name: 'Jira Basic Auth' } }
    }
  ],

  connections: {
    'Gmail Trigger':         { main: [[{ node: 'Check Duplicate',       type: 'main', index: 0 }]] },
    'Check Duplicate':       { main: [[{ node: 'Classify Email',        type: 'main', index: 0 }]] },
    'Classify Email':        { main: [[{ node: 'Is Meeting?',           type: 'main', index: 0 }]] },
    'Is Meeting?':           { main: [[{ node: 'Is Invite?',            type: 'main', index: 0 }], []] },
    'Is Invite?':            { main: [[], [{ node: 'Build Groq Request', type: 'main', index: 0 }]] },
    'Build Groq Request':    { main: [[{ node: 'Groq LLM',             type: 'main', index: 0 }]] },
    'Groq LLM':              { main: [[{ node: 'Parse LLM Response',   type: 'main', index: 0 }]] },
    'Parse LLM Response':    { main: [[{ node: 'Confidence OK?',        type: 'main', index: 0 }]] },
    'Confidence OK?':        { main: [[{ node: 'Mark as Processed',     type: 'main', index: 0 }], []] },
    'Mark as Processed':     { main: [[{ node: 'Build Confluence Page', type: 'main', index: 0 }]] },
    'Build Confluence Page': { main: [[{ node: 'Create Confluence Page',type: 'main', index: 0 }]] },
    'Create Confluence Page':{ main: [[{ node: 'Expand Action Items',   type: 'main', index: 0 }]] },
    'Expand Action Items':   { main: [[{ node: 'Has Action Items?',     type: 'main', index: 0 }]] },
    'Has Action Items?':     { main: [[{ node: 'Create Jira Issue',     type: 'main', index: 0 }], []] },
    'Create Jira Issue':     { main: [[{ node: 'High Priority?',        type: 'main', index: 0 }]] },
    'High Priority?':        { main: [[{ node: 'Get Active Sprint',     type: 'main', index: 0 }], []] },
    'Get Active Sprint':     { main: [[{ node: 'Add to Active Sprint',  type: 'main', index: 0 }]] }
  },

  settings: {
    executionOrder: 'v1',
    saveManualExecutions: true,
    callerPolicy: 'workflowsFromSameOwner',
    errorWorkflow: ''
  }
};

fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));
console.log(`Generated ${outputPath} with ${workflow.nodes.length} nodes`);
