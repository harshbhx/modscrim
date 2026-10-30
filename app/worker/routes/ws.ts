import { Hono } from 'hono';
import { errorResponse } from '../lib/errors.js';

export const wsRoutes = new Hono<{ Bindings: Env }>();

/** GET /ws/:kind/:id: forward the upgrade to the room, which checks the ticket or overlay key. */
wsRoutes.get('/:kind/:id', async (context) => {
  if (context.req.header('Upgrade') !== 'websocket') return context.text('Expected WebSocket', 426);
  const { kind, id } = context.req.param();
  if (kind !== 'ch' && kind !== 'demo') return errorResponse('not_found', 'Not found.');
  if (kind === 'ch') {
    // Never wake a room for an unknown channel.
    const known = await context.env.DB.prepare('SELECT 1 FROM channels WHERE broadcaster_id = ?').bind(id).first();
    if (!known) return errorResponse('not_found', 'Not found.');
  }
  return context.env.ROOM.getByName(`${kind}:${id}`).fetch(context.req.raw);
});
