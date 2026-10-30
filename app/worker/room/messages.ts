import { z } from 'zod';

/**
 * Client-to-room WebSocket messages (SRS §5.x, `ClientMsgZ`).
 * TODO(T-05): this belongs in `@mfd/core` `schema.ts`; switch to that import when it lands.
 */
export const ClientMsgZ = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('mod.action'),
    data: z.object({ lineId: z.string().max(80), action: z.enum(['delete', 'timeout', 'ban']) })
  }),
  z.object({ type: z.literal('sync') })
]);
