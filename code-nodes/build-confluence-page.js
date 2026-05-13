// n8n Code Node: Build Confluence Page
// Mode: Run Once for Each Item
// Builds _confluence_title (string) and _confluence_body (HTML string) from _extracted.
// Replaces the 400-char inline template previously embedded in the Confluence node.

const e = $json._extracted;

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(priority) {
  const p = (priority || 'low').toLowerCase();
  if (p === 'high')   return '<strong style="color:#bf2600">[HIGH]</strong>';
  if (p === 'medium') return '<strong style="color:#ff8b00">[MED]</strong>';
  return '<strong style="color:#505f79">[LOW]</strong>';
}

// Title: "YYYY-MM-DD — Meeting Title" or just "Meeting Title"
const _confluence_title = (e.date ? escapeHtml(e.date) + ' — ' : '') + escapeHtml(e.title || 'Meeting');

const parts = [];

// Summary
parts.push('<h2>Summary</h2>');
parts.push('<p>' + escapeHtml(e.summary || 'No summary available.') + '</p>');

// Meeting Details table — only rows where data exists
parts.push('<h2>Meeting Details</h2><table><tbody>');
if (e.date)             parts.push('<tr><td><strong>Date</strong></td><td>' + escapeHtml(e.date) + '</td></tr>');
if (e.platform)         parts.push('<tr><td><strong>Platform</strong></td><td>' + escapeHtml(e.platform) + '</td></tr>');
if (e.duration_minutes) parts.push('<tr><td><strong>Duration</strong></td><td>' + escapeHtml(String(e.duration_minutes)) + ' min</td></tr>');
if (e.start_time)       parts.push('<tr><td><strong>Time</strong></td><td>' + escapeHtml(e.start_time) + (e.end_time ? ' &ndash; ' + escapeHtml(e.end_time) : '') + '</td></tr>');
if (e.location)         parts.push('<tr><td><strong>Location</strong></td><td>' + escapeHtml(e.location) + '</td></tr>');
if (e.sentiment)        parts.push('<tr><td><strong>Sentiment</strong></td><td>' + escapeHtml(e.sentiment) + '</td></tr>');
parts.push('<tr><td><strong>Follow-up needed</strong></td><td>' + (e.follow_up_needed ? 'Yes' : 'No') + '</td></tr>');
parts.push('</tbody></table>');

// Attendees
if (e.attendees && e.attendees.length > 0) {
  parts.push('<h2>Attendees</h2><ul>');
  for (const a of e.attendees) {
    const name  = escapeHtml(a.name  || a.email || 'Unknown');
    const email = a.email ? ' (' + escapeHtml(a.email) + ')' : '';
    const role  = a.role  ? ' — ' + escapeHtml(a.role) : '';
    parts.push('<li>' + name + email + role + '</li>');
  }
  parts.push('</ul>');
}

// Decisions
if (e.decisions && e.decisions.length > 0) {
  parts.push('<h2>Decisions</h2><ul>');
  for (const d of e.decisions) parts.push('<li>' + escapeHtml(d) + '</li>');
  parts.push('</ul>');
}

// Action Items
if (e.action_items && e.action_items.length > 0) {
  parts.push('<h2>Action Items</h2><ul>');
  for (const a of e.action_items) {
    const owner = a.owner ? '<strong>' + escapeHtml(a.owner) + '</strong> — ' : '';
    const due   = a.due   ? ' <em>(due ' + escapeHtml(a.due) + ')</em>' : '';
    parts.push('<li>' + badge(a.priority) + ' ' + owner + escapeHtml(a.task) + due + '</li>');
  }
  parts.push('</ul>');
}

// Key Quotes (only when present)
if (e.key_quotes && e.key_quotes.length > 0) {
  parts.push('<h2>Key Quotes</h2><ul>');
  for (const q of e.key_quotes) {
    parts.push('<li><em>&ldquo;' + escapeHtml(q) + '&rdquo;</em></li>');
  }
  parts.push('</ul>');
}

// Topics
if (e.topics && e.topics.length > 0) {
  parts.push('<h2>Topics</h2>');
  parts.push('<p>' + e.topics.map(t => escapeHtml(t)).join(' · ') + '</p>');
}

// Source Email
parts.push('<h2>Source Email</h2>');
parts.push(
  '<p>' +
  'From: '    + escapeHtml($json._email_from    || '') + '<br/>' +
  'Date: '    + escapeHtml($json._email_date    || '') + '<br/>' +
  'Subject: ' + escapeHtml($json._email_subject || '') +
  '</p>'
);

return {
  json: {
    ...$json,
    _confluence_title,
    _confluence_body: parts.join('\n'),
  },
};
