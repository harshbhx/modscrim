import { Hono } from 'hono';

export const authRoutes = new Hono<{ Bindings: Env }>();
