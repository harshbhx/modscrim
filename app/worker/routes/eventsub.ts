import { Hono } from 'hono';

export const eventsubRoutes = new Hono<{ Bindings: Env }>();
