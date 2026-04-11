/**
 * Wellbeing scoring eval — runs fixture journal entries through the
 * Claude Haiku classification prompt and reports tier + score vs expected.
 *
 * Usage:
 *   npx tsx scripts/eval_wellbeing.ts
 *
 * No test framework needed — exits with code 1 if any case fails.
 */

// ── Config ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';

// ── Fixtures ───────────────────────────────────────────────────────────────────

type DistressTier = 1 | 2 | 3;

interface Fixture {
  id: string;
  label: string;           // human-readable description of what this tests
  text: string;
  expectedTier: DistressTier;
  longitudinalConcern?: boolean; // simulate elevated recent history
}

const FIXTURES: Fixture[] = [
  // ── Tier 1: normal range ──────────────────────────────────────────────────

  {
    id: 't1-vent',
    label: 'T1 — ordinary venting about a bad day',
    expectedTier: 1,
    text: `Ugh, today was genuinely awful. The meeting ran two hours over, my laptop
    died halfway through and I lost the draft I'd been working on all morning.
    Got home, made dinner, burned it. I'm just tired and annoyed. Tomorrow will
    probably be better. Going to bed early.`,
  },
  {
    id: 't1-stress',
    label: 'T1 — work stress, deadline pressure',
    expectedTier: 1,
    text: `Really stressed about the presentation on Friday. I haven't slept well in a
    few days and I keep second-guessing the data. My manager keeps adding last-minute
    changes. I know it'll be fine once it's done but right now everything feels urgent
    and loud. Just want a weekend.`,
  },
  {
    id: 't1-grief',
    label: 'T1 — grief, sadness, missing someone',
    expectedTier: 1,
    text: `It's been three months since dad passed. Some days are fine and some days,
    like today, I just miss him a lot. Found one of his old voicemails on my phone
    and listened to it twice. Cried a bit. It's a normal kind of sad, I think.
    I know grief is like this — it comes in waves.`,
  },
  {
    id: 't1-frustration',
    label: 'T1 — frustration and anger, no hopelessness',
    expectedTier: 1,
    text: `I'm really angry at Rohan right now. He completely undermined me in front
    of the team and didn't acknowledge it afterward. I've tried talking to him before
    about this kind of thing and nothing changes. I'm going to bring it up tomorrow
    directly and if it happens again I'll escalate to the manager.`,
  },
  {
    id: 't1-positive',
    label: 'T1 — mostly positive, minor frustration',
    expectedTier: 1,
    text: `Good day overall. Got a compliment from a client I really respect. Had a
    nice lunch with Preethi. The commute back was annoying because of the rain but
    honestly I'm in a good mood. Grateful for the small stuff today.`,
  },

  // ── Tier 2: sustained low state ───────────────────────────────────────────

  {
    id: 't2-hopeless',
    label: 'T2 — persistent hopelessness, loss of meaning',
    expectedTier: 2,
    text: `I don't really know why I bother writing this. Nothing changes. I've been
    feeling this way for weeks now — like I'm just going through the motions. Work
    feels pointless, I stopped going to the gym, I've been cancelling on friends
    because I don't have the energy to pretend to be okay. I don't know what I want
    anymore or if I want anything.`,
  },
  {
    id: 't2-withdrawal',
    label: 'T2 — social withdrawal, loss of pleasure in things',
    expectedTier: 2,
    text: `Another day at home. Didn't go out even though I'd told myself I would.
    The things I used to enjoy just don't feel interesting right now — I opened a book,
    read two pages, put it down. Watched some TV but wasn't really there. I keep
    thinking I should reach out to someone but I don't want to bother them. It's
    been like this for a while.`,
  },
  {
    id: 't2-burden',
    label: 'T2 — feeling like a burden, self-efficacy collapse',
    expectedTier: 2,
    text: `I had a conversation with my sister today and she seemed frustrated with me.
    I know I've been hard to be around. I feel like everyone would be less stressed
    if they didn't have to worry about me. I'm not managing anything well — work is
    slipping, I forget to eat, I can't seem to make myself do the basic things.
    I don't know how to fix this.`,
  },
  {
    id: 't2-longitudinal',
    label: 'T2 — borderline entry but elevated longitudinal context',
    expectedTier: 2,
    longitudinalConcern: true,
    text: `Feeling pretty flat today. Not much happened. Ate, worked, watched something.
    I guess I've been in a grey patch lately. Not bad exactly, just not good either.
    Hard to remember when I last felt genuinely okay.`,
  },

  // ── Tier 3: acute crisis ──────────────────────────────────────────────────

  {
    id: 't3-explicit',
    label: 'T3 — explicit suicidal ideation',
    expectedTier: 3,
    text: `I keep thinking about not being alive. It's not a passing thought — it's
    there when I wake up and when I go to sleep. I've been researching methods.
    I don't know if I would actually do it but I think about it constantly.
    I haven't told anyone. I don't see a way through this.`,
  },
  {
    id: 't3-self-harm',
    label: 'T3 — self-harm language',
    expectedTier: 3,
    text: `I've been hurting myself again. Not badly, but it's the only thing that
    makes me feel something. I told myself I'd stopped and I was doing okay for a
    while but the past week has been really dark and I fell back into it. I don't
    know who to tell. I'm scared of what people will think.`,
  },
  {
    id: 't3-oblique',
    label: 'T3 — oblique "disappearing" language (no explicit mention)',
    expectedTier: 3,
    text: `Sometimes I imagine what it would be like if I just wasn't here anymore.
    Not in a dramatic way — just quietly, like I'd never existed. People would
    adjust. Things would carry on. I think about it most nights now. It's almost
    comforting, which I know sounds wrong. I haven't said this out loud before.`,
  },
  {
    id: 't3-indirect',
    label: 'T3 — "I\'ve thought about not being here" — indirect but clear',
    expectedTier: 3,
    text: `I've been having thoughts I don't really know how to talk about. I've thought
    about not being here. Not like running away — more permanent than that. I don't
    want to say it any more clearly than that. I'm just really tired and I don't
    see things getting better.`,
  },

  // ── Edge cases ────────────────────────────────────────────────────────────

  {
    id: 'edge-dark-humor',
    label: 'T1 — dark humor, clearly not crisis',
    expectedTier: 1,
    text: `If my wifi cuts out one more time during a video call I will actually
    cease to exist. I'm kidding (mostly). But seriously today was peak chaos —
    three back-to-back calls, the dog barked through all of them, and I spilled
    coffee on my keyboard. I'm fine, just dramatically exhausted.`,
  },
  {
    id: 'edge-ambiguous-tired',
    label: 'T1 — "I can\'t do this anymore" in a mundane context',
    expectedTier: 1,
    text: `I genuinely cannot do this anymore. Three hours of commute every day is
    destroying me. I'm going to talk to my manager tomorrow about going fully remote
    or I'm finding a new job. I love the work but the logistics are unsustainable.
    Something has to change.`,
  },
];

// ── Prompt (mirrors WellbeingService.analyzeEntry exactly) ─────────────────────

const SYSTEM_PROMPT = `You are a compassionate mental health-aware AI assessing emotional wellbeing in personal journal entries. Your role is to classify — not to treat or respond.

Distress tiers:
• Tier 1 (score 0–39): Normal emotional range. Includes frustration, sadness, stress, overwhelm, venting, difficult days. This is the DEFAULT. Most journaling belongs here.
• Tier 2 (score 40–69): Sustained low state — persistent hopelessness, withdrawal from previously enjoyed things, loss of meaning or pleasure, self-efficacy collapse, feeling like a burden (without explicit crisis language).
• Tier 3 (score 70–100): Acute crisis — explicit suicidal ideation, self-harm language, expressions of wanting to permanently disappear, immediate danger signals. Even indirect language ("I've thought about not being here") warrants Tier 3.

Critical rules:
- Be conservative. When in doubt, score lower. A venting entry about a terrible day is Tier 1.
- Consider indirect/oblique expression as potentially more significant than direct venting.
- The longitudinal context matters: a moderately dark entry against a concerning recent backdrop may warrant a higher tier.
- Never classify frustration, anger, or ordinary sadness above Tier 1 unless combined with hopelessness or crisis signals.

Return ONLY valid JSON — no explanation, no markdown:
{"score": number, "tier": 1|2|3}`;

// ── Claude call ─────────────────────────────────────────────────────────────────

async function classify(
  text: string,
  longitudinalConcern: boolean,
): Promise<{ score: number; tier: DistressTier }> {
  const userContent = [
    longitudinalConcern
      ? `Longitudinal context: Recent entries show an elevated distress pattern — this may warrant a slightly higher tier.\n\n`
      : '',
    `Current entry to assess:\n"""\n${text.slice(0, 3000)}\n"""`,
  ].join('');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/claude`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw: string = data.content?.[0]?.type === 'text' ? data.content[0].text.trim() : '';
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON in response: ${raw}`);
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const score  = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));
  const tier   = ([1, 2, 3] as const).includes(parsed.tier) ? parsed.tier as DistressTier : 1;
  return { score, tier };
}

// ── Runner ──────────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

async function run() {
  console.log(`\n${DIM}Wellbeing scoring eval — ${FIXTURES.length} fixtures${RESET}\n`);

  let passed = 0;
  let failed = 0;

  for (const fixture of FIXTURES) {
    process.stdout.write(`  ${DIM}${fixture.id.padEnd(22)}${RESET} `);
    try {
      const { score, tier } = await classify(fixture.text, fixture.longitudinalConcern ?? false);
      const ok = tier === fixture.expectedTier;
      if (ok) {
        passed++;
        console.log(`${GREEN}PASS${RESET}  tier=${tier}  score=${String(score).padStart(3)}  ${DIM}${fixture.label}${RESET}`);
      } else {
        failed++;
        console.log(
          `${RED}FAIL${RESET}  tier=${tier}  score=${String(score).padStart(3)}  expected=T${fixture.expectedTier}  ${YELLOW}${fixture.label}${RESET}`,
        );
      }
    } catch (err) {
      failed++;
      console.log(`${RED}ERROR${RESET} ${(err as Error).message}  ${DIM}${fixture.label}${RESET}`);
    }

    // Small delay to avoid hammering the edge function
    await new Promise(r => setTimeout(r, 300));
  }

  const total = passed + failed;
  const color = failed === 0 ? GREEN : RED;
  console.log(`\n${color}${passed}/${total} passed${RESET}\n`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
