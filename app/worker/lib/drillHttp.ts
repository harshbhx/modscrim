import { z } from 'zod';
import { DrillConfigInputZ, type DrillConfigInput, type Report } from '@mfd/core';
import { DRILL_ERRORS } from '../room/drill.js';
import { AppError } from './errors.js';

/**
 * HTTP helpers shared by the streamer drill routes (`/api/drills`) and the demo drill routes
 * (`/api/demo/:room/drills`, FR-38): drill ID and body validation, and the room error mapping.
 */

const DrillIdZ = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export function drillIdOf(raw: string | undefined): string {
  const parsed = DrillIdZ.safeParse(raw);
  if (!parsed.success) throw new AppError('not_found', 'Drill not found.');
  return parsed.data;
}

/** Parse a `DrillConfigInput` body. A failure is a 400 naming the first bad field (FR-16). */
export async function readDrillConfig(request: Request): Promise<DrillConfigInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('invalid', 'Invalid request body.');
  }
  const parsed = DrillConfigInputZ.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue && issue.path.length > 0 ? issue.path.map(String).join('.') : undefined;
    throw new AppError('invalid', issue?.message ?? 'Invalid drill settings.', field);
  }
  return parsed.data;
}

/** Call a drill RPC and map the room's error messages (`DRILL_ERRORS`) to API errors. */
export async function drillCall<T>(run: () => Promise<T>, conflictMessage: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message === DRILL_ERRORS.notFound || message === 'room_not_bootstrapped') {
      throw new AppError('not_found', 'Drill not found.');
    }
    if (message === DRILL_ERRORS.conflict) throw new AppError('conflict', conflictMessage);
    if (message === DRILL_ERRORS.invalid) throw new AppError('invalid', 'Invalid drill settings.');
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
}

/** A drill's report, or a 404 while the drill has none yet (it is saved when the drill ends, FR-27). */
export function reportOrNotFound(report: Report | null): Report {
  if (!report) throw new AppError('not_found', 'Report not found.');
  return report;
}
