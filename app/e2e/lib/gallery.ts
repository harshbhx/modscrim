import type { Page } from '@playwright/test';

/**
 * The shared-state primitives from app/src/styles/base.css and animations.css,
 * laid out on a spec-only page (not a route). The built SPA is loaded for its
 * stylesheets, then its body is swapped for this markup, so the gallery always
 * shows the real shared CSS of the branch under test. Strings here are neutral
 * placeholders for the gallery only; no app copy is added or changed.
 */
export const GALLERY_STATES = ['hover', 'focus', 'disabled', 'loading', 'empty', 'error'] as const;
export type GalleryState = (typeof GALLERY_STATES)[number];

const HTML = `
<main id="gallery" style="padding:24px;display:grid;gap:32px;background:var(--bg);color:var(--text)">
  <section id="state-hover" aria-label="hover">
    <h2>Hover</h2>
    <div class="actions" style="margin:0">
      <button class="btn btn-orange" type="button">Primary</button>
      <button class="btn btn-line" type="button">Secondary</button>
      <a href="#gallery">Link</a>
    </div>
  </section>
  <section id="state-focus" aria-label="focus">
    <h2>Focus</h2>
    <div class="actions" style="margin:0">
      <button class="btn btn-orange" type="button">Primary</button>
      <input aria-label="Field" value="Field" />
    </div>
  </section>
  <section id="state-disabled" aria-label="disabled">
    <h2>Disabled</h2>
    <div class="actions" style="margin:0">
      <button class="btn btn-orange" type="button" disabled>Primary</button>
      <button class="btn btn-line" type="button" disabled>Secondary</button>
    </div>
  </section>
  <section id="state-loading" aria-label="loading">
    <h2>Loading</h2>
    <div class="skeleton anim-pulse" style="height:24px;width:60%"></div>
    <div class="skeleton" style="height:24px;width:40%;margin-top:12px"></div>
    <button class="btn btn-orange" type="button" aria-busy="true" disabled style="margin-top:12px">Working</button>
  </section>
  <section id="state-empty" aria-label="empty">
    <h2>Empty</h2>
    <div class="empty-state"><span class="empty-state-icon" aria-hidden="true">0</span><p>Nothing here yet</p></div>
  </section>
  <section id="state-error" aria-label="error">
    <h2>Error</h2>
    <div class="error-state" role="alert"><span class="error-state-icon" aria-hidden="true">!</span><p>Something went wrong</p></div>
  </section>
</main>`;

/** Load the app's stylesheets, then replace the page with the gallery. */
export async function openGallery(page: Page): Promise<void> {
  await page.goto('/privacy');
  await page.waitForLoadState('networkidle');
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, HTML);
}

/** Put one section into its state, leaving the pointer or focus on the element. */
export async function enterState(page: Page, state: GalleryState): Promise<void> {
  if (state === 'hover') {
    await page.locator('#state-hover .btn-orange').hover();
    // Let the 120 ms transition finish before measuring or shooting.
    await page.waitForTimeout(250);
  }
  if (state === 'focus') {
    await page.locator('#state-focus .btn-orange').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
  }
}
