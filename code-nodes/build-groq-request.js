// n8n Code Node: Build Groq API Request Body
// Mode: Run Once for Each Item
// Input: Classify Email output
// Output: { _groq_body: {...}, ...original fields }

const SYSTEM_PROMPT = `You analyze meeting-related emails (calendar invites, recap threads, recording links, auto-transcripts from Otter/Fathom/Fireflies/Read.ai, intros, scheduling messages) and return a strict JSON object describing the meeting.

Schema (return ONLY valid JSON, no prose, no markdown fences):
{
  "title": "string — short human-readable title, e.g. Q3 pricing review w/ Alice",
  "kind": "invite|recording|transcript|recap|conversation|other",
  "platform": "google-meet|zoom|teams|webex|chime|in-person|phone|unknown",
  "date": "YYYY-MM-DD or null",
  "start_time": "HH:MM (24h) or null",
  "end_time": "HH:MM (24h) or null",
  "duration_minutes": "integer or null",
  "location": "string or null",
  "attendees": [
    { "name": "string or null", "email": "string or null", "role": "host|organizer|attendee|optional|null" }
  ],
  "summary": "2-4 sentence plain prose summary",
  "topics": ["short kebab-case tags, 3-8 items"],
  "decisions": ["each a single declarative sentence"],
  "action_items": [
    { "owner": "string or null", "task": "string", "due": "YYYY-MM-DD or null", "done": false, "priority": "high|medium|low" }
  ],
  "key_quotes": ["up to 3 short quotes under 25 words, only if transcript included"],
  "links": ["recording/transcript/doc URLs, deduped"],
  "sentiment": "positive|neutral|mixed|tense|null",
  "follow_up_needed": true,
  "confidence": 0.0
}

Rules:
- If the email is a scheduling back-and-forth with no confirmed time, set kind = "conversation".
- If the email is clearly NOT meeting-related, set confidence < 0.3 and leave most fields empty/null.
- Names: Title Case. Emails: lowercase.
- Topics: 1-3 words, kebab-case, no leading #.
- Action item priority: "high" = blocking, urgent, ASAP, must be done this week or before next meeting; "medium" = important with deadline within the month; "low" = nice-to-have, far future, or no clear deadline.
- Output valid JSON only. No markdown. No commentary.`;

const subject  = $json.subject  || $json.Subject  || '(no subject)';
const from     = $json.from     || $json.From     || '';
const to       = $json.to       || $json.To       || '';
const date     = $json.date     || $json.Date     || '';
const body     = $json.text     || $json.body     || $json.snippet || '';

// Truncate body to 18000 chars to stay within token limits
const truncated = body.length > 18000
  ? body.slice(0, 9000) + '\n\n…[truncated]…\n\n' + body.slice(-9000)
  : body;

const userPrompt = `SUBJECT: ${subject}
FROM:    ${from}
TO:      ${to}
DATE:    ${date}

--- BODY ---
${truncated}`;

return {
  json: {
    ...$json,
    _groq_body: {
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
    },
  },
};
