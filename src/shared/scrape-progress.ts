import type { ScrapeJob } from './types.js';

/**
 * A feed is considered exhausted only when the job is terminal and the
 * scraper's final step explicitly records that the end of the Maps list was reached.
 * The fallback supports persisted jobs whose completion_reason was not hydrated.
 */
export function isFeedExhaustedJob(job: ScrapeJob | null): boolean {
  if (!job || job.status === 'running') return false;
  return job.completion_reason === 'feed_exhausted' ||
    job.current_step?.trim().toLocaleLowerCase() === 'fim da lista de resultados';
}

/**
 * The requested target is NEW saved establishments, not discovered or processed
 * Maps cards. A confirmed end-of-feed is a completed execution (100%), while
 * the separate X/Y counter continues to show how many new records were saved.
 */
export function calculateScrapeProgressPercent(job: ScrapeJob | null): number {
  if (!job) return 0;

  const target = Math.max(1, job.limit_requested || 20);
  const collected = Math.max(0, job.total_collected || 0);
  const achieved = Math.min(100, Math.round((collected / target) * 100));

  if (job.status === 'completed' || job.completion_reason === 'target_reached' || isFeedExhaustedJob(job) || collected >= target) return 100;
  return Math.min(99, achieved);
}
