/**
 * SupabaseService — fetches Wisdom Shorts from Supabase with local caching.
 *
 * Strategy:
 *  1. Return cached shorts immediately if fresh (< 24 h old)
 *  2. Fetch from Supabase in background; update cache + notify caller
 *  3. On network failure, return stale cache or SHORTS_LIBRARY fallback
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WisdomShort } from '../types';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/keys';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CACHE_KEY = 'supabase_shorts_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  data: WisdomShort[];
  timestamp: number;
}

// ── Row → WisdomShort ─────────────────────────────────────────────────────────

function mapRow(row: Record<string, any>): WisdomShort {
  return {
    id:                  row.id,
    title:               row.title,
    short:               row.short,
    pullquote:           row.pullquote,
    source_author:       row.source_author,
    source_url:          row.source_url ?? '',
    source_type:         row.source_type ?? 'talk',
    themes:              row.themes ?? [],
    emotional_states:    row.emotional_states ?? [],
    cognitive_patterns:  row.cognitive_patterns ?? [],
    values:              row.values ?? [],
    enneagram_resonance: row.enneagram_resonance ?? [],
    cognitive_style:     row.cognitive_style ?? [],
    depth:               row.depth ?? 'mid',
    imageUri:            row.image_url ?? undefined,
    imagePrompt:         row.image_prompt ?? undefined,
  };
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function readCache(): Promise<CacheEntry | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

async function writeCache(data: WisdomShort[]): Promise<void> {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

// ── Fetch from Supabase ───────────────────────────────────────────────────────

async function fetchFromSupabase(): Promise<WisdomShort[] | null> {
  try {
    const { data, error } = await supabase
      .from('wisdom_shorts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      console.warn('[Supabase] Fetch error or empty result:', error?.message);
      return null;
    }

    return data.map(mapRow);
  } catch (err) {
    console.warn('[Supabase] Network error:', err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the shorts library from cache or Supabase.
 * Falls back to the bundled SHORTS_LIBRARY if both are unavailable.
 *
 * @param onRefresh  Called with fresh data if a background fetch returns
 *                   newer results than what was initially returned.
 */
export async function getShortsLibrary(
  onRefresh?: (fresh: WisdomShort[]) => void,
): Promise<WisdomShort[]> {
  const cache = await readCache();
  const now = Date.now();
  const isFresh = cache && now - cache.timestamp < CACHE_TTL;

  if (isFresh) {
    // Return cached immediately; refresh in background if older than 1 hour
    if (now - cache.timestamp > 60 * 60 * 1000) {
      fetchFromSupabase().then(fresh => {
        if (fresh && fresh.length > 0) {
          writeCache(fresh);
          onRefresh?.(fresh);
        }
      });
    }
    return cache.data;
  }

  // No fresh cache — fetch now
  const fresh = await fetchFromSupabase();

  if (fresh && fresh.length > 0) {
    await writeCache(fresh);
    return fresh;
  }

  // Fallback: stale cache > bundled library
  if (cache?.data?.length) {
    console.warn('[Supabase] Using stale cache as fallback');
    return cache.data;
  }

  console.warn('[Supabase] Using bundled SHORTS_LIBRARY as fallback');
  return SHORTS_LIBRARY;
}

/**
 * Insert or update a single short in Supabase (for admin/migration use).
 */
export async function upsertShort(short: WisdomShort): Promise<void> {
  const { error } = await supabase.from('wisdom_shorts').upsert({
    id:                  short.id,
    title:               short.title,
    short:               short.short,
    pullquote:           short.pullquote,
    source_author:       short.source_author,
    source_url:          short.source_url,
    source_type:         short.source_type,
    themes:              short.themes,
    emotional_states:    short.emotional_states,
    cognitive_patterns:  short.cognitive_patterns,
    values:              short.values,
    enneagram_resonance: short.enneagram_resonance,
    cognitive_style:     short.cognitive_style ?? [],
    depth:               short.depth,
    image_url:           short.imageUri ?? null,
    image_prompt:        short.imagePrompt ?? null,
  });

  if (error) console.error('[Supabase] upsert error:', error.message);
}
