import type { ReportJob } from '@mfd/core';

declare global {
  interface Env {
    REPORTS?: R2Bucket;
    REPORT_QUEUE?: Queue<ReportJob>;
    AI?: unknown;
  }
}
