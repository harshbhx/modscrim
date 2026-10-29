import { Hono } from 'hono';

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/health', (context) => context.json({ ok: true }));
