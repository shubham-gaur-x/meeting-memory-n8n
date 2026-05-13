// n8n Code Node: Expand Action Items
// Mode: Run Once for All Items
// Input: Create Confluence Page output (1 item)
// Output: N items — one per action item — each ready for Jira Create Issue

const items = $input.all();
const result = [];

for (const item of items) {
  const confluencePageId  = item.json.id    || '';
  const confluencePageUrl = item.json._links?.webui
    ? `https://shubhamgaur1.atlassian.net/wiki${item.json._links.webui}`
    : '';

  // Get extraction data from Parse LLM Response node
  const parsed     = $('Parse LLM Response').item.json;
  const extracted  = parsed._extracted;
  const actionItems = extracted.action_items || [];

  if (actionItems.length === 0) {
    // No action items — output one sentinel so the downstream Has Action Items? node can filter it
    result.push({
      json: {
        _no_action_items: true,
        _extracted: extracted,
        _confluence_page_url: confluencePageUrl,
        _confluence_page_id:  confluencePageId,
      },
    });
    continue;
  }

  for (let i = 0; i < actionItems.length; i++) {
    const ai = actionItems[i];
    const priority = _getPriority(ai);

    result.push({
      json: {
        _extracted:            extracted,
        _confluence_page_url:  confluencePageUrl,
        _confluence_page_id:   confluencePageId,
        _action_item_index:    i,
        _current_action_item:  ai,
        _priority:             priority,
        _is_high_priority:     priority === 'high',
        _jira_summary:         (ai.task || 'Action item').slice(0, 255),
        _jira_due_date:        ai.due   || null,
        _jira_owner:           ai.owner || null,
        _jira_labels:          ['meeting-generated', ...(extracted.topics || [])],
        _jira_description:     _buildDescription(extracted, ai, priority, confluencePageUrl, parsed),
        _email_subject:        parsed._email_subject || '',
        _email_from:           parsed._email_from    || '',
        _email_date:           parsed._email_date    || '',
      },
    });
  }
}

return result;

// ---- helpers ----------------------------------------------------------------

function _getPriority(item) {
  const p = (item.priority || '').toLowerCase();
  if (p === 'high' || p === 'medium' || p === 'low') return p;

  // Due-date heuristic for items without a priority field
  if (item.due) {
    try {
      const days = Math.floor(
        (new Date(item.due) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (days <= 14) return 'high';
      if (days <= 60) return 'medium';
    } catch (_) {}
  }
  return 'low';
}

function _buildDescription(extracted, ai, priority, confluenceUrl, parsed) {
  const lines = [];

  lines.push('Meeting: ' + (extracted.title || 'Meeting'));

  let meetingLine = 'Date: ' + (extracted.date || 'Unknown');
  if (extracted.platform && extracted.platform !== 'unknown') {
    meetingLine += ' | Platform: ' + extracted.platform;
  }
  if (extracted.duration_minutes) {
    meetingLine += ' | Duration: ' + extracted.duration_minutes + ' min';
  }
  lines.push(meetingLine);
  lines.push('');

  lines.push('Action Item:');
  lines.push(ai.task || 'Action item');
  lines.push('');

  const meta = [];
  if (ai.owner)  meta.push('Owner: ' + ai.owner);
  if (ai.due)    meta.push('Due: ' + ai.due);
  if (priority)  meta.push('Priority: ' + priority);
  if (meta.length) lines.push(meta.join('  |  '));

  lines.push('');
  lines.push('──────────────────────────────');
  lines.push('Meeting Summary:');
  lines.push(extracted.summary || '');

  if (extracted.decisions && extracted.decisions.length > 0) {
    lines.push('');
    lines.push('Decisions:');
    for (const d of extracted.decisions) lines.push('• ' + d);
  }

  if (extracted.attendees && extracted.attendees.length > 0) {
    lines.push('');
    lines.push('Attendees:');
    for (const a of extracted.attendees) {
      const name  = a.name || a.email || 'Unknown';
      const email = (a.email && a.name) ? ' (' + a.email + ')' : '';
      lines.push('• ' + name + email);
    }
  }

  lines.push('');
  lines.push('──────────────────────────────');
  if (confluenceUrl) lines.push('Confluence Note: ' + confluenceUrl);
  lines.push(
    'Source: "' + (parsed._email_subject || '') +
    '" from '  + (parsed._email_from    || '') +
    ' on '     + (parsed._email_date    || '')
  );

  return lines.join('\n');
}
