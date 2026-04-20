/**
 * Builds a CurationContext from the user's current state + the surface they
 * tapped "new perspective" from. Aggregates UserContextV2, JournalSignal,
 * and the caller-provided source content into the shape mindCuration.curate
 * expects.
 *
 * Kept separate from mindCuration.ts so the rule reducer stays pure and
 * testable under plain tsx.
 */

import { getUserContextV2 } from './UserContextService';
import { StorageService } from './StorageService';
import type {
  CurationContext,
  CurationContextSourceContent,
} from './mindCuration';

export async function buildCurationContext(args: {
  sourceSurface: CurationContext['sourceSurface'];
  sourceContent?: CurationContextSourceContent;
  intentionCategory?: string;
}): Promise<CurationContext> {
  // UserContextV2 gives us wellbeing, tenure, and intention ids in one read.
  const user = await getUserContextV2().catch(() => null);

  // JournalSignal (extracted from the latest day summary by WisdomService)
  // is the best local source for themes/emotions without an extra AI call.
  const signal = await StorageService.getJournalSignal().catch(() => null);

  // Dedupe + cap at 3 apiece — the curation rules only check membership,
  // so a long list is wasted bytes.
  const dominantThemes = signal?.themes
    ? Array.from(new Set(signal.themes.map(t => t.toLowerCase()))).slice(0, 3)
    : [];

  const dominantEmotions = signal?.emotional_states
    ? Array.from(new Set(signal.emotional_states.map(e => e.toLowerCase()))).slice(0, 3)
    : [];

  return {
    sourceSurface: args.sourceSurface,
    sourceContent: args.sourceContent,
    wellbeingState: user?.wellbeingState ?? 'regulated',
    dominantEmotions,
    dominantThemes,
    activeIntentions: (user?.activeIntentions ?? []).map(i => i.id),
    tenureDays: user?.tenureDays ?? 0,
    ...(args.intentionCategory ? { intentionCategory: args.intentionCategory } : {}),
  };
}
