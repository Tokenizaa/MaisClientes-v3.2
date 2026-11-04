import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScrapeJob } from './types.js';
import { calculateScrapeProgressPercent, isFeedExhaustedJob } from './scrape-progress.js';

function job(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
  return {
    id: 'job_test_12345678',
    user_id: 'user_test',
    segment: 'restaurantes',
    location: 'São Paulo, SP',
    limit_requested: 20,
    status: 'running',
    status_message: '',
    total_found: 0,
    total_collected: 0,
    total_duplicates: 0,
    total_errors: 0,
    created_at: new Date(0).toISOString(),
    ...overrides,
  };
}

test('progress is based on NEW saved establishments, not discovered cards', () => {
  assert.equal(calculateScrapeProgressPercent(job({
    phase: 'processing',
    total_found: 40,
    total_collected: 0,
    total_duplicates: 29,
    candidate_cursor: 29,
    candidate_urls: ['only-the-current-bounded-item'],
  })), 0);
});

test('progress follows the requested target as new establishments are saved', () => {
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 1 })), 5);
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 11 })), 55);
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 19 })), 95);
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 20 })), 100);
});

test('partial, failed and stopped jobs show the target actually achieved', () => {
  assert.equal(calculateScrapeProgressPercent(job({ status: 'partial', total_collected: 11 })), 55);
  assert.equal(calculateScrapeProgressPercent(job({ status: 'failed', total_collected: 0 })), 0);
  assert.equal(calculateScrapeProgressPercent(job({ status: 'stopped', total_collected: 3 })), 15);
});

test('completed jobs report 100 percent', () => {
  assert.equal(calculateScrapeProgressPercent(job({ status: 'completed', total_collected: 20 })), 100);
});

test('confirmed natural feed exhaustion reports 100 percent even when the new-contact target was not met', () => {
  assert.equal(calculateScrapeProgressPercent(job({
    status: 'partial',
    completion_reason: 'feed_exhausted',
    total_found: 108,
    total_collected: 4,
    total_duplicates: 102,
    total_errors: 2,
  })), 100);
});

test('terminal job with explicit end-of-list step is recognized if completion_reason is missing', () => {
  const ended = job({
    status: 'partial',
    current_step: 'Fim da lista de resultados',
    total_found: 106,
    total_collected: 0,
    total_duplicates: 104,
    total_errors: 2,
  });
  assert.equal(isFeedExhaustedJob(ended), true);
  assert.equal(calculateScrapeProgressPercent(ended), 100);
});

test('a running job is never considered exhausted based only on a stale step label', () => {
  assert.equal(isFeedExhaustedJob(job({
    status: 'running',
    current_step: 'Fim da lista de resultados',
  })), false);
});

test('access restriction and unconfirmed stagnation do not masquerade as completed progress', () => {
  assert.equal(calculateScrapeProgressPercent(job({
    status: 'partial',
    completion_reason: 'access_restricted',
    total_collected: 4,
  })), 20);
  assert.equal(calculateScrapeProgressPercent(job({
    status: 'partial',
    completion_reason: 'feed_stagnation',
    total_collected: 4,
  })), 20);
});
