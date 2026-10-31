// T-110 (#151): in Firefox, pressing Enter in a console form field must not reload the page under the CSP.
// Run by .github/workflows/firefox-console-check.yml. Usage: node scripts/firefox-console-check.mjs [url]
import { firefox } from 'playwright';

const url = process.argv[2] ?? 'https://modscrim.dualmindlab.tech/console';
const browser = await firefox.launch();
const page = await browser.newPage();

const cspMessages = [];
const navigations = [];
page.on('console', (message) => {
  if (/content security policy|csp/i.test(message.text())) cspMessages.push(message.text());
});
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) navigations.push(frame.url());
});

await page.goto(url, { waitUntil: 'load' });
const marker = await page.evaluate(() => {
  window.__t110 = 'still here';
  return window.__t110;
});
const loads = navigations.length;

const forms = await page.locator('form').count();
const fields = page.locator('form input[type="number"]');
const fieldCount = await fields.count();
const results = [];
for (let i = 0; i < fieldCount; i += 1) {
  const field = fields.nth(i);
  await field.focus();
  await field.press('Enter');
  results.push({ id: await field.getAttribute('id'), reloaded: (await page.evaluate(() => window.__t110)) !== marker });
}
await page.waitForTimeout(1000);

const survived = (await page.evaluate(() => window.__t110)) === marker;
const sameUrl = page.url() === url;
const extraNavigations = navigations.length - loads;

console.log(JSON.stringify({ url, browser: 'firefox', forms, fieldsTried: fieldCount, results, survived, sameUrl, extraNavigations, cspMessages }, null, 2));
await browser.close();

if (forms === 0 || fieldCount === 0) throw new Error('No form fields found to test');
if (!survived || !sameUrl || extraNavigations > 0) throw new Error('Pressing Enter reloaded or navigated the page');
if (cspMessages.length > 0) throw new Error('CSP violations were logged');
