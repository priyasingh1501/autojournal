/**
 * DigestService — AsyncStorage wrapper around digestCompute.
 *
 * Cache key: `digest_<YYYY-MM-DD>`. The cached entry includes the
 * entry-count-at-compute-time, so a stale cache invalidates as soon as one
 * more entry is logged that date (cache misses and recomputes).
 *
 * Compute is cheap (pure arithmetic over entries) so we favour "recompute
 * on entry change" over elaborate incremental updates.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import { getActiveIntentions, intentionsEnabled } from './IntentionsService';
import { computeDigest } from './digestCompute';
import { DayDigest } from '../types';

const KEY_PREFIX = 'digest_';

interface CachedDigest extends DayDigest {
  entryCountAtCompute: number;
}

function keyFor(date: string): string {
  return `${KEY_PREFIX}${date}`;
}

async function readCached(date: string): Promise<CachedDigest | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(date));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCached(digest: CachedDigest): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(digest.date), JSON.stringify(digest));
  } catch { /* non-fatal */ }
}

/**
 * Get the digest for `date`, recomputing if the cache is stale (entry count
 * changed) or missing. Always returns a fresh/valid digest.
 */
export async function getDigest(date: string): Promise<DayDigest> {
  const entries = await StorageService.getTranscriptsForDate(date);
  const cached  = await readCached(date);
  if (cached && cached.entryCountAtCompute === entries.length) {
    // Strip the cache-only field before returning.
    const { entryCountAtCompute: _ignored, ...digest } = cached;
    return digest;
  }

  const intentionsOn = await intentionsEnabled();
  const intentions   = intentionsOn ? await getActiveIntentions().catch(() => []) : [];
  const digest       = computeDigest(date, entries, intentions);
  await writeCached({ ...digest, entryCountAtCompute: entries.length });
  return digest;
}

/**
 * Force the cache for a given date to be discarded. Call this on any path
 * that mutates entries for that date (save, delete, edit).
 */
export async function invalidateDigest(date: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(date));
  } catch { /* non-fatal */ }
}
