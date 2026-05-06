/**
 * One-time migration script — seeds all shorts from shortsLibrary.ts into Supabase.
 *
 * Run from the project root:
 *   npx tsx scripts/migrate-shorts.ts
 */

import { createClient } from '@supabase/supabase-js';
import { SHORTS_LIBRARY } from '../src/data/shortsLibrary';

const SUPABASE_URL = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function migrate() {
  console.log(`Migrating ${SHORTS_LIBRARY.length} shorts to Supabase...`);

  const rows = SHORTS_LIBRARY.map(s => ({
    id:                  s.id,
    title:               s.title,
    short:               s.short,
    pullquote:           s.pullquote,
    source_author:       s.source_author,
    source_url:          s.source_url ?? '',
    source_type:         s.source_type,
    themes:              s.themes ?? [],
    emotional_states:    s.emotional_states ?? [],
    cognitive_patterns:  s.cognitive_patterns ?? [],
    values:              s.values ?? [],
    enneagram_resonance: s.enneagram_resonance ?? [],
    cognitive_style:     s.cognitive_style ?? [],
    depth:               s.depth,
    image_url:           s.imageUri ?? null,
    image_prompt:        s.imagePrompt ?? null,
  }));

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('wisdom_shorts').upsert(batch);
    if (error) {
      console.error(`Batch ${i}–${i + BATCH} failed:`, error.message);
    } else {
      console.log(`✓ Inserted ${i + 1}–${Math.min(i + BATCH, rows.length)} of ${rows.length}`);
    }
  }

  console.log('Migration complete.');
}

migrate().catch(console.error);
