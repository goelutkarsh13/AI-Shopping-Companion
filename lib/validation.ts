// Request validation for the chat endpoint.
//
// This lives outside app/api/chat/route.ts on purpose: Next.js route modules may only
// export route handlers and a fixed set of config fields, so anything else — including
// the pure functions worth unit-testing — belongs in a normal module.

export type IncomingMessage = { role: "user" | "assistant"; content: string };

// Input bounds. These aren't arbitrary: a conversation this long or a message this large
// isn't a real person asking whether to buy a laptop, and every request costs API credits.
export const LIMITS = {
  maxMessages: 40,
  maxMessageChars: 4_000,
  maxTotalChars: 24_000,
  requestsPerWindow: 20,
  windowMs: 60_000,
};

export type ValidationResult =
  | { ok: true; messages: IncomingMessage[] }
  | { ok: false; error: string };

export function validateMessages(input: unknown): ValidationResult {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a list of messages." };
  if (input.length === 0) return { ok: false, error: "No messages provided." };
  if (input.length > LIMITS.maxMessages) {
    return { ok: false, error: "This conversation is too long — start a new question." };
  }

  let total = 0;
  const messages: IncomingMessage[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Malformed message." };
    const { role, content } = raw as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "Each message needs a role of 'user' or 'assistant'." };
    }
    if (typeof content !== "string") return { ok: false, error: "Message content must be text." };

    const trimmed = content.trim();
    if (!trimmed) return { ok: false, error: "Message content can't be empty." };
    if (trimmed.length > LIMITS.maxMessageChars) {
      return { ok: false, error: "That message is too long — could you shorten it?" };
    }

    total += trimmed.length;
    if (total > LIMITS.maxTotalChars) {
      return { ok: false, error: "This conversation is too long — start a new question." };
    }
    messages.push({ role, content: trimmed });
  }

  return { ok: true, messages };
}
