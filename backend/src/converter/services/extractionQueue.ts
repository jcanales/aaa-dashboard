import { runExtraction } from './conversionsService';

// In-process background queue for invoice extraction. The upload route returns a
// 'processing' row immediately and hands the PDF here; at most CONCURRENCY jobs
// run at once so a bulk drop of 50 files doesn't fire 50 Anthropic calls in
// parallel. State lives only in this Node process — a restart abandons the queue,
// which is why staleConversions.ts sweeps rows left in 'processing'.

export const CONCURRENCY = 3;

type Runner = (conversionId: string, pdfBase64: string) => Promise<void>;

// Injectable so tests can drive the queue without real extraction.
let runner: Runner = runExtraction;
export function __setRunnerForTest(fn: Runner | null): void {
  runner = fn ?? runExtraction;
}

interface Job {
  conversionId: string;
  pdfBase64: string;
}

const pending: Job[] = [];
let active = 0;

function pump(): void {
  while (active < CONCURRENCY && pending.length > 0) {
    const job = pending.shift()!;
    active++;
    Promise.resolve()
      .then(() => runner(job.conversionId, job.pdfBase64))
      .catch((err) => console.error('[extractionQueue] runExtraction threw for', job.conversionId, err))
      .finally(() => {
        active--;
        pump();
      });
  }
}

export function scheduleExtraction(conversionId: string, pdfBase64: string): void {
  pending.push({ conversionId, pdfBase64 });
  pump();
}

// Test/introspection helper.
export function queueDepth(): { pending: number; active: number } {
  return { pending: pending.length, active };
}
