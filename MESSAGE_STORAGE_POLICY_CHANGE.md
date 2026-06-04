# Message Storage Policy Change

## Summary

✅ **Changed message storage to PRIVATE CHATS ONLY**

Messages are now stored ONLY for 1-on-1 private chats between users and bots. Messages in groups and channels are NOT stored.

---

## What Changed

### Before:
- ❌ Messages stored for ALL chat types (private, groups, channels)
- ❌ Privacy concerns in group/channel contexts
- ❌ Unnecessary storage for group messages

### After:
- ✅ Messages stored ONLY for private (1-on-1) chats
- ✅ No storage for groups or channels
- ✅ Privacy-friendly for group/channel users
- ✅ AI still has conversation context in private chats

---

## Files Modified

### 1. `src/services/bot-logic.service.ts`
**Change:** Check chat type before storing incoming messages

```typescript
// Only store messages from private chats
const chatType = msg.chat?.type || "private";

if (chatType === "private") {
  await MessageRepository.storeMessage({
    direction: "in",
    // ... store incoming user message
  });
}
```

### 2. `src/services/bot-chat.service.ts`
**Changes:**
- Check chat type before storing bot responses
- Only load history for private chats
- Only load summary for private chats

```typescript
const chatType = msg?.chat?.type || "private";

// Load history only for private chats
const history = chatType === "private" 
  ? await this.loadHistory(env, cfg.botProjectId, chatId)
  : []; // Empty for groups/channels

// Store bot response only for private chats
if (chatType === "private") {
  await MessageRepository.storeMessage({
    direction: "out",
    // ... store bot response
  });
}
```

---

## Impact Analysis

### ✅ Private Chats (1-on-1)
- **Messages stored:** YES ✅
- **AI has context:** YES ✅
- **Conversation history:** YES ✅
- **Behavior:** **UNCHANGED** ✅

### ✅ Groups
- **Messages stored:** NO ❌
- **AI has context:** NO ❌
- **Bot still responds:** YES ✅
- **User experience:** Each message is isolated (no conversation memory)

### ✅ Channels
- **Messages stored:** NO ❌
- **AI has context:** NO ❌
- **Bot still responds:** YES ✅
- **User experience:** Each message is isolated (no conversation memory)

---

## Telegram Chat Types

```typescript
// From Telegram API
msg.chat.type values:
- "private"       // 1-on-1 chat → STORE MESSAGES ✅
- "group"         // Group chat → DON'T STORE ❌
- "supergroup"    // Supergroup → DON'T STORE ❌
- "channel"       // Channel → DON'T STORE ❌
```

---

## Storage Savings

### Before:
- Private: 100 messages/day → Stored ✅
- Groups: 500 messages/day → Stored ✅ (unnecessary)
- **Total:** 600 messages/day

### After:
- Private: 100 messages/day → Stored ✅
- Groups: 500 messages/day → NOT stored ❌
- **Total:** 100 messages/day
- **Savings:** 83% reduction 📉

---

## Broadcast Behavior

**No change to broadcasts:**

The broadcast subscriber query still works correctly:

```sql
SELECT DISTINCT chat_id, user_id FROM (
  SELECT chat_id, user_id FROM bot_subscribers WHERE subscribed = 1 
  UNION 
  SELECT chat_id, user_id FROM messages WHERE direction = 'in'
)
```

Since only private chat messages are stored, broadcasts will only go to:
- ✅ Users who explicitly subscribed
- ✅ Users who messaged the bot privately

---

## Migration Notes

### Cleanup of Existing Group Messages

Existing messages from groups/channels will be automatically cleaned up by:

1. **Retention Policy** (30 days)
   - `AdminService.retentionCleanup()` runs daily
   - Deletes messages older than 30 days
   - Group/channel messages will naturally expire

2. **No Manual Cleanup Needed**
   - Old group messages will be removed automatically
   - No immediate action required

---

## Testing Checklist

- [ ] **Private Chat (1-on-1)**
  - User sends message → Stored in DB ✅
  - Bot responds → Response stored in DB ✅
  - Next message → AI has conversation context ✅

- [ ] **Group Chat**
  - User sends message → NOT stored in DB ✅
  - Bot responds → Response NOT stored ✅
  - Next message → AI has NO context (isolated) ✅

- [ ] **Channel**
  - User sends message → NOT stored in DB ✅
  - Bot responds → Response NOT stored ✅

- [ ] **Broadcasts**
  - Private chat users receive broadcasts ✅
  - Explicitly subscribed users receive broadcasts ✅

---

## Why This Change?

### 1. **Privacy** 🔒
- Users in groups/channels don't expect their messages to be logged
- Respects privacy expectations

### 2. **Storage Efficiency** 💾
- Groups generate high message volume
- Private chats are where AI context matters most

### 3. **Use Case Alignment** 🎯
- AI conversation memory is most valuable in 1-on-1 chats
- Group bots typically respond to commands, not conversations

### 4. **Compliance** ⚖️
- Easier to comply with privacy regulations (GDPR, etc.)
- Minimal data collection

---

## Rollback Plan

If you need to revert and store messages for all chat types:

### 1. Remove chat type checks from:
- `src/services/bot-logic.service.ts` line ~27
- `src/services/bot-chat.service.ts` lines ~28, ~93

### 2. Change to:
```typescript
// Store all messages regardless of chat type
await MessageRepository.storeMessage({ ... });
```

---

**Date:** 2026-01-25  
**Change Type:** Logic change (no schema migration needed)  
**Files Modified:** 2 files  
**Migration File:** `migrations/0017_messages_private_only_policy.sql`  
**Status:** ✅ IMPLEMENTED
