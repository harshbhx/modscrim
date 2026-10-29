import { Hono } from 'hono';

export const wsRoutes = new Hono<{ Bindings: Env }>();
