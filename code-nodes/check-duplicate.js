// n8n Code Node: Check Duplicate
// Mode: Run Once for Each Item
// Checks workflow static data for already-processed Gmail message IDs.
// Returns [] (empty) to stop execution for duplicates.
// Returns item with _message_id added for new messages.

const state = $getWorkflowStaticData('global');
state.processed = state.processed || {};

const msgId = $json.id || $json.messageId || '';

if (!msgId) {
  // No message ID available — let through (cannot deduplicate without an ID)
  return { json: { ...$json, _message_id: '' } };
}

if (state.processed[msgId]) {
  // Already processed — return empty array to stop this execution branch silently
  return [];
}

return { json: { ...$json, _message_id: msgId } };
