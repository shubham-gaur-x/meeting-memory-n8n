// n8n Code Node: Parse LLM Response
// Mode: Run Once for Each Item
// Input: Groq HTTP Request output
// Output: original email fields + _extracted { title, attendees, action_items, ... }

const raw = $json.choices?.[0]?.message?.content || '';

// Strip markdown fences if model ignores response_format instruction
let text = raw.trim();
if (text.startsWith('```')) {
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```\s*$/, '');
  text = text.trim();
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch (_) {
  // Best-effort: find the first balanced { } block
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object in LLM response: ' + text.slice(0, 200));

  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        parsed = JSON.parse(text.slice(start, i + 1));
        break;
      }
    }
  }
  if (!parsed) throw new Error('Could not extract JSON from LLM response');
}

// Pull the email fields from the upstream Build Groq Request node
const email = $('Build Groq Request').item.json;

return {
  json: {
    // Preserve original email metadata
    _email_subject:    email.subject  || email.Subject  || '',
    _email_from:       email.from     || email.From     || '',
    _email_date:       email.date     || email.Date     || '',
    _email_message_id: email.id       || email.messageId || '',
    // Forward _message_id set by Check Duplicate (survives through Groq LLM via Build Groq Request)
    _message_id:       email._message_id || email.id || email.messageId || '',
    _classification:   email._classification,

    // Structured extraction result
    _extracted: {
      title:            parsed.title            || 'Meeting',
      kind:             parsed.kind             || 'other',
      platform:         parsed.platform         || 'unknown',
      date:             parsed.date             || null,
      start_time:       parsed.start_time       || null,
      end_time:         parsed.end_time         || null,
      duration_minutes: parsed.duration_minutes || null,
      location:         parsed.location         || null,
      attendees:        parsed.attendees        || [],
      summary:          parsed.summary          || '',
      topics:           (parsed.topics || []).map(t => t.toLowerCase().trim()),
      decisions:        parsed.decisions        || [],
      action_items:     parsed.action_items     || [],
      key_quotes:       parsed.key_quotes       || [],
      links:            parsed.links            || [],
      sentiment:        parsed.sentiment        || null,
      follow_up_needed: !!parsed.follow_up_needed,
      confidence:       parseFloat(parsed.confidence) || 0,
    },
  },
};
