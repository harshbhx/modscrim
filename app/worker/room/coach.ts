import type { CoachStats } from '@mfd/core';
import { z } from 'zod';
import { log } from '../lib/log.js';

/**
 * Optional Workers AI coach's note (FR-42, SRS §5.14, P2). The prompt holds the fixed instruction and the
 * four score numbers only: never line text, names, terms or chat. Any error, a timeout, a missing binding or
 * the flag being off means the caller keeps the template note.
 */

/** A Free plan text model. `[verify]` its Neuron cost per call (open-questions.md); the call logs its outcome. */
export const COACH_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
/** Longest wait for the model before the template note stands. */
export const COACH_AI_TIMEOUT_MS = 8000;
/** The fixed instruction (SRS §5.14). */
export const COACH_AI_INSTRUCTION = 'Write two short, friendly coaching sentences for a Twitch mod team.';
/** Longest note kept from the model; a longer answer is cut at a word boundary. */
export const COACH_AI_MAX_CHARS = 320;

export type CoachPrompt = { messages: Array<{ role: 'system' | 'user'; content: string }>; max_tokens: number };

/** The Workers AI binding as this module uses it: one `run` call. The binding stays optional in `Env`. */
type AiRunner = { run(model: string, inputs: CoachPrompt): Promise<unknown> };

/** The instruction, then the numbers as JSON with fixed keys: nothing else reaches the model. */
export function coachPrompt(s: CoachStats): CoachPrompt {
  const numbers = { attacksShown: s.attacksShown, slipped: s.slipped, falseBans: s.falseBans, fastestMs: s.fastestMs };
  return {
    messages: [
      { role: 'system', content: COACH_AI_INSTRUCTION },
      { role: 'user', content: JSON.stringify(numbers) }
    ],
    max_tokens: 120
  };
}

/** True when the flag is on and an `AI` binding is present. */
export function coachAiEnabled(env: Env): boolean {
  return String(env.COACH_AI_ENABLED).toLowerCase() === 'true' && aiRunner(env.AI) !== null;
}

function aiRunner(ai: unknown): AiRunner | null {
  if (ai === null || typeof ai !== 'object') return null;
  return typeof (ai as { run?: unknown }).run === 'function' ? (ai as AiRunner) : null;
}

/** Text models answer `{ response }`; chat-style models answer `{ choices: [{ message: { content } }] }`. */
const AiOutputZ = z.union([
  z.object({ response: z.string() }).transform((o) => o.response),
  z
    .object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) })
    .transform((o) => o.choices[0]?.message.content ?? '')
]);

/** One paragraph of plain text, at most `COACH_AI_MAX_CHARS`; null when nothing usable is left. */
export function cleanCoachText(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;
  if (text.length <= COACH_AI_MAX_CHARS) return text;
  const cut = text.slice(0, COACH_AI_MAX_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Ask Workers AI for the note. Returns the text, or null on any error, timeout, unusable answer or when the
 * feature is off; the caller then keeps the template note. Logs the outcome, never the note itself.
 */
export async function aiCoachNote(env: Env, stats: CoachStats, room: string, drill: string): Promise<string | null> {
  const ai = String(env.COACH_AI_ENABLED).toLowerCase() === 'true' ? aiRunner(env.AI) : null;
  if (!ai) return null;
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('coach_ai_timeout')), COACH_AI_TIMEOUT_MS);
    });
    const raw = await Promise.race([ai.run(COACH_AI_MODEL, coachPrompt(stats)), timeout]);
    const parsed = AiOutputZ.safeParse(raw);
    const text = parsed.success ? cleanCoachText(parsed.data) : null;
    log('coach.note', { room, drill, model: COACH_AI_MODEL, ok: text !== null, ms: Date.now() - started });
    return text;
  } catch (error) {
    const reason = error instanceof Error && error.message === 'coach_ai_timeout' ? 'timeout' : 'error';
    log('coach.note', { room, drill, model: COACH_AI_MODEL, ok: false, reason, ms: Date.now() - started });
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
