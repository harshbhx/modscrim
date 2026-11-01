import { expect, test } from './fixtures.js';

test('loads the shared demo console and opens its room socket', async ({ page, demo }) => {
  const helloPromise = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === `/ws/demo/${demo.room}`)
    .then((socket) => socket.waitForEvent('framereceived', (frame) => typeof frame.payload === 'string' && frame.payload.includes('"type":"hello"')));
  await page.goto(`/demo/${encodeURIComponent(demo.room)}`);

  await expect(page.getByRole('heading', { name: 'Pixel Panda' })).toBeVisible();
  await expect(helloPromise).resolves.toBeTruthy();
});
