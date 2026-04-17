/**
 * Persistence for "Not quite" dismissals on Patterns observations.
 *
 * Stored fingerprints are injected into the next generation prompt so the
 * same observation doesn't re-surface. Fingerprint is `${type}__${normalized title}`
 * — titles rather than bodies because Claude's title is more stable across runs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AcrossTimeType } from '../types';

const KEY = 'patterns_dismissed';

export type DismissReason = 'not_quite' | 'too_soft';

export interface DismissedObservation {
  fingerprint: string;
  type: AcrossTimeType;
  title: string;
  reason: DismissReason;
  dismissedAt: number;
}

export function fingerprintFor(type: AcrossTimeType, title: string): string {
  const normalized = title.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${type}__${normalized}`;
}

export async function getDismissed(): Promise<DismissedObservation[]> {
  try {
    const json = await AsyncStorage.getItem(KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function addDismissal(args: {
  type: AcrossTimeType;
  title: string;
  reason: DismissReason;
}): Promise<void> {
  const existing = await getDismissed();
  const fingerprint = fingerprintFor(args.type, args.title);
  // De-dupe by fingerprint — tapping dismiss twice shouldn't grow the list.
  const without = existing.filter(d => d.fingerprint !== fingerprint);
  without.push({
    fingerprint,
    type: args.type,
    title: args.title,
    reason: args.reason,
    dismissedAt: Date.now(),
  });
  // Cap to last 200 to keep the prompt bounded.
  const capped = without.length > 200 ? without.slice(-200) : without;
  await AsyncStorage.setItem(KEY, JSON.stringify(capped));
}

export function isDismissed(
  list: DismissedObservation[],
  type: AcrossTimeType,
  title: string,
): boolean {
  const fp = fingerprintFor(type, title);
  return list.some(d => d.fingerprint === fp);
}
