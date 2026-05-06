/**
 * useActiveMindsRoster — React hook returning the permanent 9-mind V2 roster
 * (Companion + 8 specialists). Callers iterating the result to render a picker
 * should continue to treat `id === 'companion'` specially if they want the
 * "no persona" behaviour to render distinctly.
 */

import { MINDS_V2 } from '../services/mindsConfigV2';
import type { MindV2 } from '../types';

export function useActiveMindsRoster(): readonly MindV2[] {
  return MINDS_V2;
}
