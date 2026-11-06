// One-time import of chat history from the retired AI Assistant page.
//
// The legacy page (formerly routed at /ai-assistant, which now redirects
// to /ai-engineer) stored a single conversation thread in localStorage
// under "civilos-ai-chat". The canonical AI Engineer page never read
// that key, so returning users could no longer see that history even
// though it was still on their device. This module converts the legacy
// thread into a normal conversation in the canonical page's list.
//
// The import is conservative:
// - it runs only when a non-empty, well-formed legacy thread exists;
// - it never overwrites or merges into an existing conversation — the
//   legacy thread becomes its own clearly titled conversation that the
//   user can open, continue, or delete like any other;
// - it is idempotent: importing the same legacy thread twice does not
//   create a duplicate (the caller also removes the legacy key after a
//   successful import).

export const LEGACY_CHAT_STORAGE_KEY = "civilos-ai-chat";
export const LEGACY_IMPORT_TITLE = "Imported — legacy AI Assistant chat";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ImportableConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

/** Parse and validate a raw legacy localStorage value. Returns [] for
 *  anything that is not a usable message thread. */
export function parseLegacyChatHistory(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const messages: ChatMessage[] = [];
  for (const entry of parsed) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      (entry as { role?: unknown }).role !== undefined &&
      ((entry as { role?: unknown }).role === "user" ||
        (entry as { role?: unknown }).role === "assistant") &&
      typeof (entry as { content?: unknown }).content === "string"
    ) {
      messages.push({
        role: (entry as { role: "user" | "assistant" }).role,
        content: (entry as { content: string }).content,
      });
    }
  }
  return messages;
}

const sameMessages = (a: ChatMessage[], b: ChatMessage[]): boolean =>
  a.length === b.length &&
  a.every((m, i) => m.role === b[i].role && m.content === b[i].content);

/**
 * If a legacy thread exists and has not already been imported, append
 * it as a new conversation titled LEGACY_IMPORT_TITLE. Otherwise return
 * the list unchanged. `id` and `now` are injected so the function stays
 * pure and testable.
 */
export function importLegacyChatHistory<T extends ImportableConversation>(
  conversations: T[],
  legacyRaw: string | null,
  deps: { id: string; now: number },
): { conversations: T[]; imported: boolean } {
  const legacyMessages = parseLegacyChatHistory(legacyRaw);
  if (legacyMessages.length === 0) {
    return { conversations, imported: false };
  }
  const alreadyImported = conversations.some(
    (c) => c.title === LEGACY_IMPORT_TITLE && sameMessages(c.messages, legacyMessages),
  );
  if (alreadyImported) {
    return { conversations, imported: false };
  }
  const importedConversation = {
    id: deps.id,
    title: LEGACY_IMPORT_TITLE,
    messages: legacyMessages,
    updatedAt: deps.now,
  } as T;
  return { conversations: [...conversations, importedConversation], imported: true };
}
