/**
 * Validation for the `POST /api/chat` request body.
 *
 * The body arrives from a browser, so every field in it is attacker-controlled.
 * Two things matter here beyond "is this well-formed JSON":
 *
 *  1. **Role confinement.** `convertToModelMessages` maps whatever roles it is
 *     given onto model messages. A client that can put `role: "system"` in the
 *     history can overwrite the server's instructions, which is a prompt
 *     injection with no retrieval step required. Only `user` and `assistant`
 *     are accepted, and the system prompt stays server-side.
 *
 *  2. **Size bounds.** Token spend is a function of history length. An
 *     unbounded `messages` array is an unbounded bill, so the count, the parts
 *     per message, and the text length per part are all capped.
 *
 * Structural validation of the message parts themselves is delegated to the AI
 * SDK's own `validateUIMessages`, so this file never has to track the evolving
 * `UIMessagePart` union by hand.
 */

import { validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

export const MAX_MESSAGES = 50;
export const MAX_PARTS_PER_MESSAGE = 32;
export const MAX_TEXT_LENGTH = 8_000;
/** Hard ceiling on the raw body, checked before parsing. 256 KiB. */
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * Envelope schema: the fields we depend on, with the limits applied.
 *
 * Unknown keys on a part are passed through rather than rejected, because the
 * SDK owns the part shape and adds to it between minor versions. The text
 * length cap is enforced on whatever does carry a `text` field.
 */
const uiPartSchema = z
  .object({
    type: z.string().min(1),
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
  })
  .loose();

const uiMessageSchema = z
  .object({
    id: z.string().min(1).max(256),
    // `system` is intentionally absent: see the note at the top of this file.
    role: z.enum(["user", "assistant"]),
    parts: z.array(uiPartSchema).min(1).max(MAX_PARTS_PER_MESSAGE),
  })
  .loose();

const chatRequestSchema = z
  .object({
    messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
  })
  .loose();

export type ValidationFailure = { ok: false; status: number; error: string };
export type ValidationSuccess = { ok: true; messages: UIMessage[] };
export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Read, bound, and validate the request body.
 *
 * Returns a discriminated result instead of throwing so the caller decides the
 * status code and response shape in one place. Error strings are fixed
 * sentences: they never echo the submitted body back, and they never include a
 * parser message that could describe server internals.
 */
export async function parseChatRequest(request: Request): Promise<ValidationResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Request body could not be read." };
  }

  // `content-length` is a claim, not a fact, and it counts bytes while
  // `String.length` counts UTF-16 code units. Measure the encoded size so a
  // body of multi-byte characters cannot exceed the limit unnoticed.
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: "Request body is not valid JSON." };
  }

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Request body does not match the expected chat shape.",
    };
  }

  // Second pass: let the SDK confirm the parts are ones it can actually convert.
  try {
    const messages = await validateUIMessages({ messages: parsed.data.messages });
    return { ok: true, messages };
  } catch {
    return { ok: false, status: 400, error: "One or more messages are malformed." };
  }
}
