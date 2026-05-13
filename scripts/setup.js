#!/usr/bin/env node
// scripts/setup.js
// Creates n8n credentials and imports the workflow from .env config.
// Run: node scripts/setup.js
//
// After running, one manual step remains:
//   Open the workflow URL printed below → click Gmail Trigger → Connect Gmail OAuth2.

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Load .env ────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found.');
    console.error('       Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function requireEnv(keys) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('ERROR: Missing required .env values:', missing.join(', '));
    process.exit(1);
  }
}

// ── n8n API helper ───────────────────────────────────────────────────────────
// Supports two auth modes:
//   N8N_API_KEY    → public REST API  (/api/v1/...)  via X-N8N-API-KEY header
//   N8N_AUTH_COOKIE → internal REST API (/rest/...)  via browser session cookie

function n8nRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const base      = process.env.N8N_BASE_URL.replace(/\/$/, '');
    const usePublic = !!process.env.N8N_API_KEY;
    const prefix    = usePublic ? '/api/v1' : '/rest';
    const url       = new URL(`${base}${prefix}${endpoint}`);
    const data      = body ? JSON.stringify(body) : null;

    const authHeader = usePublic
      ? { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
      : { 'Cookie': process.env.N8N_AUTH_COOKIE };

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = (url.protocol === 'https:' ? https : require('http')).request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`n8n API ${res.statusCode} on ${method} ${endpoint}:\n${raw}`));
        } else {
          resolve(JSON.parse(raw));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Credential creation ───────────────────────────────────────────────────────

async function createCredential(name, type, data) {
  const result = await n8nRequest('POST', '/credentials', { name, type, data, nodesAccess: [] });
  console.log(`  ✓ ${name} (id: ${result.id})`);
  return result.id;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  requireEnv([
    'N8N_BASE_URL',
    'GROQ_API_KEY',
    'ATLASSIAN_EMAIL',
    'ATLASSIAN_API_TOKEN',
    'ATLASSIAN_HOST',
  ]);

  if (!process.env.N8N_API_KEY && !process.env.N8N_AUTH_COOKIE) {
    console.error('ERROR: Provide either N8N_API_KEY or N8N_AUTH_COOKIE in .env');
    console.error('       N8N_API_KEY:     from n8n → Settings → n8n API');
    console.error('       N8N_AUTH_COOKIE: browser DevTools → any /rest/ request → Cookie header');
    process.exit(1);
  }

  const authMode = process.env.N8N_API_KEY ? 'public API (X-N8N-API-KEY)' : 'internal API (session cookie)';
  console.log(`Auth mode: ${authMode}`);

  const atlassianHost = process.env.ATLASSIAN_HOST.replace(/\/$/, '');
  const n8nBase       = process.env.N8N_BASE_URL.replace(/\/$/, '');

  console.log('\n── Step 1: Creating credentials ────────────────────────────');

  const groqId = await createCredential('Groq API', 'httpHeaderAuth', {
    name:  'Authorization',
    value: `Bearer ${process.env.GROQ_API_KEY}`,
  });

  const confluenceId = await createCredential('Confluence account', 'confluenceApi', {
    username: process.env.ATLASSIAN_EMAIL,
    apiKey:   process.env.ATLASSIAN_API_TOKEN,
    domain:   `${atlassianHost}/wiki`,
  });

  const jiraId = await createCredential('Jira account', 'jiraSoftwareCloudApi', {
    email:     process.env.ATLASSIAN_EMAIL,
    apiToken:  process.env.ATLASSIAN_API_TOKEN,
    domain:    atlassianHost,
  });

  const jiraBasicId = await createCredential('Jira Basic Auth', 'httpBasicAuth', {
    user:     process.env.ATLASSIAN_EMAIL,
    password: process.env.ATLASSIAN_API_TOKEN,
  });

  console.log('\n── Step 2: Patching workflow with credential IDs ────────────');

  const workflowPath = path.join(__dirname, '..', 'workflows', 'meeting-memory.json');
  const workflow     = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

  // Patch credential IDs into each node
  for (const node of workflow.nodes) {
    const c = node.credentials;
    if (!c) continue;
    if (c.httpHeaderAuth)       c.httpHeaderAuth.id       = groqId;
    if (c.confluenceApi)        c.confluenceApi.id        = confluenceId;
    if (c.jiraSoftwareCloudApi) c.jiraSoftwareCloudApi.id = jiraId;
    if (c.httpBasicAuth)        c.httpBasicAuth.id        = jiraBasicId;
  }

  // Apply any config overrides from .env
  for (const node of workflow.nodes) {
    if (node.name === 'Create Confluence Page' && process.env.CONFLUENCE_SPACE_KEY) {
      node.parameters.spaceKey = process.env.CONFLUENCE_SPACE_KEY;
    }
    if (node.name === 'Create Jira Issue' && process.env.JIRA_PROJECT_KEY) {
      node.parameters.project = { key: process.env.JIRA_PROJECT_KEY };
    }
    if (node.name === 'Get Active Sprint' && process.env.JIRA_BOARD_ID) {
      node.parameters.url = node.parameters.url.replace(
        /\/board\/\d+\//,
        `/board/${process.env.JIRA_BOARD_ID}/`
      );
    }
    if (node.name === 'Add to Active Sprint' && process.env.ATLASSIAN_HOST) {
      node.parameters.url = node.parameters.url.replace(
        /https:\/\/[^/]+/,
        atlassianHost
      );
    }
  }

  console.log('  ✓ Credential IDs and config patched');

  console.log('\n── Step 3: Importing workflow ───────────────────────────────');

  const created = await n8nRequest('POST', '/workflows', workflow);
  console.log(`  ✓ Workflow imported (id: ${created.id})`);

  console.log('\n────────────────────────────────────────────────────────────');
  console.log('Setup complete!\n');
  console.log(`Workflow URL: ${n8nBase}/workflow/${created.id}\n`);
  console.log('One manual step remaining:');
  console.log('  1. Open the workflow URL above');
  console.log('  2. Click the Gmail Trigger node');
  console.log('  3. Under "Credential", click "Create new credential"');
  console.log(`  4. Sign in with ${process.env.GMAIL_EMAIL || 'your Gmail account'}`);
  console.log('  5. Save, then click the Active toggle to enable polling');
  console.log('────────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
