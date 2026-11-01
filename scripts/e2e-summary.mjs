import { appendFile, readFile } from 'node:fs/promises';

const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'test-results/e2e-results.json';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const projectNames = ['setup', 'smoke', 'safety', 'console', 'mod'];
const totals = new Map(projectNames.map((name) => [name, { passed: 0, failed: 0, skipped: 0 }]));

try {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const project = test.projectName ?? suite.projectName ?? 'other';
          if (!totals.has(project)) totals.set(project, { passed: 0, failed: 0, skipped: 0 });
          const counts = totals.get(project);
          const result = test.results?.at(-1);
          if (test.expectedStatus === 'skipped' || result?.status === 'skipped') counts.skipped += 1;
          else if (result?.status === 'passed') counts.passed += 1;
          else counts.failed += 1;
        }
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const fallback = `## Playwright project results\n\nUnable to read the JSON report: ${message}\n`;
  if (summaryPath) await appendFile(summaryPath, fallback, 'utf8');
  else process.stdout.write(fallback);
  process.exitCode = 0;
}

const rows = [...totals].map(([name, counts]) => `| ${name} | ${counts.passed} | ${counts.failed} | ${counts.skipped} |`);
const summary = [
  '## Playwright project results',
  '',
  '| Project | Passed | Failed | Skipped |',
  '| --- | ---: | ---: | ---: |',
  ...rows,
  ''
].join('\n');
if (summaryPath) await appendFile(summaryPath, summary, 'utf8');
else process.stdout.write(summary);