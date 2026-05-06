/**
 * One-time script — removes all School of Life shorts from Supabase.
 *
 * Run from the project root:
 *   npx tsx scripts/delete-school-of-life.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  // First, count what we're about to delete
  const { count } = await supabase
    .from('wisdom_shorts')
    .select('*', { count: 'exact', head: true })
    .eq('source_author', 'The School of Life');

  console.log(`Found ${count ?? 0} School of Life shorts to delete.`);

  if (!count) {
    console.log('Nothing to delete.');
    return;
  }

  const { error } = await supabase
    .from('wisdom_shorts')
    .delete()
    .eq('source_author', 'The School of Life');

  if (error) {
    console.error('Delete failed:', error.message);
  } else {
    console.log(`✓ Deleted ${count} School of Life shorts.`);
  }
}

run().catch(console.error);
