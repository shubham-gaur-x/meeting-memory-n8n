// n8n Code Node: Mark as Processed
// Mode: Run Once for Each Item
// Writes Gmail message ID + metadata to workflow static data.
// Runs after the confidence gate — only emails that pass both gates are recorded.
// This is the deduplication commit point.

const state = $getWorkflowStaticData('global');
state.processed = state.processed || {};

const msgId = $json._message_id || $json._email_message_id || '';
if (msgId) {
  state.processed[msgId] = {
    processed_at: new Date().toISOString(),
    kind: $json._extracted?.kind || 'unknown',
    confidence: $json._extracted?.confidence || 0,
  };
}

return { json: $json };
