/**
 * FeatureFlagsService — small AsyncStorage-backed flag registry for phased redesign.
 *
 * All flags default OFF. Flag names are also the AsyncStorage keys (the `ff_`
 * prefix is part of the canonical name), so callers can't accidentally store
 * a flag under a non-prefixed key.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type FeatureFlag =
  | 'ff_new_day_summary'   // Phase 1
  | 'ff_patterns_tab'      // Phase 2
  | 'ff_simple_home'       // Phase 3
  | 'ff_journal_merge'     // Phase 4
  | 'ff_intentions'        // Phase 5
  | 'ff_letters'           // Phase 6
  | 'ff_day_close_model'   // Phase 7 — digest-by-day, summary-at-close
  | 'ff_new_minds_system'; // Phase 8 — rewritten UserContext for mind conversations

export const ALL_FLAGS: readonly FeatureFlag[] = [
  'ff_new_day_summary',
  'ff_patterns_tab',
  'ff_simple_home',
  'ff_journal_merge',
  'ff_intentions',
  'ff_letters',
  'ff_day_close_model',
  'ff_new_minds_system',
] as const;

export const FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  ff_new_day_summary:  false,
  ff_patterns_tab:     false,
  ff_simple_home:      false,
  ff_journal_merge:    false,
  ff_intentions:       false,
  ff_letters:          false,
  ff_day_close_model:  false,
  ff_new_minds_system: false,
};

// Preview builds ship with revamp flags on so testers see the full redesign.
const PREVIEW_DEFAULTS: Partial<Record<FeatureFlag, boolean>> = {
  ff_new_day_summary:  true,
  ff_patterns_tab:     true,
  ff_simple_home:      true,
  ff_journal_merge:    true,
  ff_intentions:       true,
  ff_new_minds_system: true,
  ff_day_close_model:  true,
};

const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

export const FeatureFlagsService = {
  async getFlag(name: FeatureFlag, defaultValue?: boolean): Promise<boolean> {
    const raw = await AsyncStorage.getItem(name);
    if (raw === null) {
      if (defaultValue !== undefined) return defaultValue;
      return IS_PREVIEW ? (PREVIEW_DEFAULTS[name] ?? FLAG_DEFAULTS[name]) : FLAG_DEFAULTS[name];
    }
    return raw === '1';
  },

  async setFlag(name: FeatureFlag, value: boolean): Promise<void> {
    await AsyncStorage.setItem(name, value ? '1' : '0');
  },

  async getAllFlags(): Promise<Record<FeatureFlag, boolean>> {
    const pairs = await Promise.all(
      ALL_FLAGS.map(async (name) => [name, await this.getFlag(name)] as const),
    );
    return Object.fromEntries(pairs) as Record<FeatureFlag, boolean>;
  },
};
