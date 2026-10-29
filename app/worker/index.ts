import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (context) => context.json({ ok: true }));

export class ChannelRoom {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  }
}

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> | Response {
    return app.fetch(request, env, executionContext);
  }
};
