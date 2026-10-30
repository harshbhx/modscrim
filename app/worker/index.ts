import { Hono } from 'hono';
import type { ReportJob } from '@mfd/core';
import { hourly } from './jobs/hourly.js';
import { errorMiddleware, errorResponse } from './lib/errors.js';
import { log } from './lib/log.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { eventsubRoutes } from './routes/eventsub.js';
import { wsRoutes } from './routes/ws.js';

const app = new Hono<{ Bindings: Env }>();

app.onError((error, context) => errorMiddleware(error, context));
app.route('/auth', authRoutes);
app.route('/api', apiRoutes);
app.route('/eventsub', eventsubRoutes);
app.route('/ws', wsRoutes);
app.notFound(() => errorResponse('not_found', 'Not found.'));

export { ChannelRoom } from './room/ChannelRoom.js';

export default {
  fetch: app.fetch,
  // FR-03, FR-11, FR-43
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(hourly(env).then(
      () => undefined,
      () => log('job.failed', { room: 'cron', kind: 'hourly' })
    ));
  },
  queue(batch: MessageBatch<ReportJob>, env: Env): void {
    if (!env.REPORTS) {
      batch.retryAll();
      return;
    }
    batch.retryAll();
  }
} satisfies ExportedHandler<Env, ReportJob>;
