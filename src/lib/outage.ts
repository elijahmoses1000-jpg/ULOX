/**
 * Telling our own outage apart from an upstream one.
 *
 * When the platform suspends an app it answers every backend route with 402,
 * and a gateway problem shows as 502/503/504. The Learning Paths screen read
 * any failure as "the roadmap catalogue could not be reached" and offered a
 * Retry, which sent learners to look at roadmap.sh — a site that was working
 * perfectly. Naming the right side is the difference between a user waiting
 * and a user filing a bug against the wrong service.
 */

const OUTAGE_CODES = new Set([402, 502, 503, 504]);

export function isServiceOutage(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' && OUTAGE_CODES.has(status);
}

export const OUTAGE_TITLE = 'UloX services are temporarily unavailable';

export const OUTAGE_DETAIL =
  'This is on our side, not the learning sources. Anything already on this device still works; published builds, matches and certificates will return with the service.';
