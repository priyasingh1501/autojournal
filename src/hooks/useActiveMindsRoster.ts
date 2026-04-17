/**
 * useActiveMindsRoster — React hook returning the correct mind roster for
 * the current flag state.
 *
 * Under ff_new_minds_system OFF: returns the legacy `MINDS` array from
 * MindService exactly as before (7 entries: 6 specialists + Companion-as-null
 * handled separately by the UI).
 *
 * Under ff_new_minds_system ON: returns `MINDS_V2` (9 entries, Companion
 * inclusive). Callers iterating the result to render a picker should
 * continue to treat `id === 'companion'` specially if they want the "no
 * persona" behaviour to render distinctly.
 */

import { useEffect, useState } from 'react';
import { FeatureFlagsService } from '../services/FeatureFlagsService';
import { MINDS } from '../services/MindService';
import { MINDS_V2 } from '../services/mindsConfigV2';
import type { Mind, MindV2 } from '../types';

export function useActiveMindsRoster(): readonly (Mind | MindV2)[] {
  // Default to legacy so the UI never blanks while resolving. Flipped to V2
  // on first render tick when the flag is on.
  const [roster, setRoster] = useState<readonly (Mind | MindV2)[]>(MINDS);

  useEffect(() => {
    let cancelled = false;
    FeatureFlagsService.getFlag('ff_new_minds_system')
      .then(on => {
        if (cancelled) return;
        setRoster(on ? MINDS_V2 : MINDS);
      })
      .catch(() => { /* keep default legacy */ });
    return () => { cancelled = true; };
  }, []);

  return roster;
}
