import { expect, test } from './fixtures.js';
import { consoleChat, modChat, openModPage, prepareSafetyDrill, renderedLines, TOKEN_SHAPES } from './lib/safety.js';

/**
 * NFR-12, AGENTS.md rule 2: tokens never leave the Worker. While a demo drill runs on the console and the
 * mod view, every response body the browser receives (documents, scripts, styles, API calls) and every
 * WebSocket frame must be free of the token shapes the CI secret scan looks for. The patterns are shapes,
 * not names, so this spec holds no secret name or value.
 */

const TEXT_TYPES = /json|text|javascript|xml|svg|html|css/i;

test('no response body or socket frame reaching the browser carries a token', async ({ page, request, demo, baseURL }) => {
  test.setTimeout(120_000);
  const received: Array<{ where: string; text: string }> = [];
  const pending: Array<Promise<void>> = [];

  page.on('response', (response) => {
    pending.push((async () => {
      try {
        if (!TEXT_TYPES.test(response.headers()['content-type'] ?? '')) return;
        received.push({ where: `response ${response.status()} ${new URL(response.url()).pathname}`, text: await response.text() });
      } catch {
        // Redirects and aborted requests have no body to read.
      }
    })());
  });
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      received.push({ where: `socket ${new URL(socket.url()).pathname}`, text: typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8') });
    });
  });

  const drill = await prepareSafetyDrill(request, demo, baseURL);
  try {
    const joined = await drill.join('Safety mod');
    await drill.start();

    // The streamer console over the demo loop...
    await page.goto(`/demo/${encodeURIComponent(demo.room)}`);
    await renderedLines(consoleChat(page));

    // ...and the mod view in the same browser, on its own socket.
    const modPage = await page.context().newPage();
    modPage.on('response', (response) => {
      pending.push((async () => {
        try {
          if (!TEXT_TYPES.test(response.headers()['content-type'] ?? '')) return;
          received.push({ where: `mod response ${response.status()} ${new URL(response.url()).pathname}`, text: await response.text() });
        } catch {
          // Same as above.
        }
      })());
    });
    modPage.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        received.push({ where: `mod socket ${new URL(socket.url()).pathname}`, text: typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8') });
      });
    });
    await openModPage(modPage, demo, joined);
    await renderedLines(modChat(modPage));
    await modPage.close();
  } finally {
    await drill.stop();
  }
  await Promise.all(pending);

  // The scan must have seen real traffic, or a quiet failure would read as a pass.
  expect(received.some((item) => item.where.startsWith('socket ')), 'console socket frames were recorded').toBe(true);
  expect(received.some((item) => item.where.startsWith('mod socket ')), 'mod socket frames were recorded').toBe(true);
  expect(received.some((item) => /\.js$/.test(item.where)), 'the app scripts were scanned').toBe(true);
  expect(received.some((item) => item.where.includes('/api/demo/')), 'demo API responses were recorded').toBe(true);

  for (const item of [...received, ...drill.bodies.map((text) => ({ where: 'helper API response', text }))]) {
    const match = TOKEN_SHAPES.exec(item.text);
    // Report where, never the matched text.
    expect(match === null, `${item.where} matches a token shape`).toBe(true);
  }
});
