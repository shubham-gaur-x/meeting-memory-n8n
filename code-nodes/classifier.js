// n8n Code Node: Classify Email
// Mode: Run Once for Each Item
// Input: Gmail Trigger output
// Output: original item + _classification { is_meeting, score, reason, kind }

const MEETING_SENDERS = new Set([
  'noreply-calendar-invitation@google.com',
  'calendar-notification@google.com',
  'gemini-notes@google.com',
  'no-reply@zoom.us',
  'no-reply@us05web.zoom.us',
  'noreply@zoom.us',
  'no-reply@meet.google.com',
  'no-reply@chime.aws',
  'noreply@webex.com',
  'noreply@teams.microsoft.com',
  'fathom@fathom.video',
  'noreply@fathom.video',
  'team@otter.ai',
  'noreply@otter.ai',
  'noreply@fireflies.ai',
  'no-reply@fireflies.ai',
  'noreply@read.ai',
  'no-reply@calendly.com',
  'scheduling@x.ai',
]);

const MEETING_DOMAINS = new Set([
  'fathom.video',
  'otter.ai',
  'fireflies.ai',
  'read.ai',
  'calendly.com',
  'savvycal.com',
  'zoom.us',
  'webex.com',
  'teams.microsoft.com',
  'meet.google.com',
  'chime.aws',
]);

const SUBJECT_HINTS = [
  /\binvitation\b/i,
  /\bmeeting\b/i,
  /\bcall\b/i,
  /\bsync\b/i,
  /\b1:1\b/i,
  /\bone[- ]on[- ]one\b/i,
  /\bstandup\b/i,
  /\bstand-up\b/i,
  /\bcatch[- ]up\b/i,
  /\bcheck[- ]in\b/i,
  /\bdiscussion\b/i,
  /\bagenda\b/i,
  /\binterview\b/i,
  /\bdebrief\b/i,
  /\bplanning\b/i,
  /\bretro(spective)?\b/i,
  /\breview\b/i,
  /\bworkshop\b/i,
  /\bdemo\b/i,
  /\bkick[- ]?off\b/i,
  /\bintro\b/i,
  /\bchat\b/i,
  /\bquick (call|chat|sync)\b/i,
  /\baction items?\b/i,
  /\bnotes?(\s+from|:)\b/i,
  /\brecap of\b/i,
  /\b(transcript|recording) (of|from|for)\b/i,
  /\b(zoom|teams|meet|webex|chime) (recording|meeting|invite)\b/i,
];

const BODY_HINTS = /meeting (link|recording|transcript)|join (the )?meeting|google meet|zoom\.us\/(j|my)\/|teams\.microsoft\.com\/l\/meetup|action items?|attendees?:|agenda|recap|begin:vcalendar/i;

// Extract sender email from "Display Name <email@domain.com>" format
const rawFrom = ($json.from || $json.From || '').toLowerCase();
const emailMatch = rawFrom.match(/<([^>]+)>/);
const senderEmail = emailMatch ? emailMatch[1] : rawFrom.trim();
const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : '';

const subject = ($json.subject || $json.Subject || '').toLowerCase();
const body = ($json.text || $json.body || $json.snippet || '').toLowerCase();

let score = 0;
const reasons = [];
let kind = 'other';

if (MEETING_SENDERS.has(senderEmail)) {
  score += 0.8;
  reasons.push(`sender:${senderEmail}`);
}
if (MEETING_DOMAINS.has(senderDomain)) {
  score += 0.5;
  reasons.push(`domain:${senderDomain}`);
}
if (SUBJECT_HINTS.some(re => re.test(subject))) {
  score += 0.4;
  reasons.push('subject-hint');
}
if (BODY_HINTS.test(body)) {
  score += 0.3;
  reasons.push('body-hint');
}
if (body.includes('begin:vcalendar')) {
  score += 0.5;
  reasons.push('vcalendar');
}

// Kind detection
if (body.includes('begin:vcalendar') || subject.includes('invitation')) {
  kind = 'invite';
} else if (subject.includes('canceled event')) {
  kind = 'invite';
} else if (subject.includes('recording') || body.slice(0, 500).includes('recording')) {
  kind = 'recording';
} else if (subject.includes('transcript') || body.slice(0, 1000).includes('transcript')) {
  kind = 'transcript';
} else if (senderEmail === 'gemini-notes@google.com' || body.slice(0, 200).includes('notes from')) {
  kind = 'transcript';
} else if (subject.includes('recap') || subject.includes('notes from') || body.includes('action items')) {
  kind = 'recap';
} else if (MEETING_DOMAINS.has(senderDomain)) {
  kind = 'recap';
} else if (score >= 0.4) {
  kind = 'conversation';
}

return {
  json: {
    ...$json,
    _classification: {
      is_meeting: score >= 0.6,
      score: Math.round(score * 100) / 100,
      reason: reasons.join(', ') || 'no signals',
      kind,
    },
  },
};
