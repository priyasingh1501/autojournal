import { AcrossTimeObservation } from '../types';

export function accentColorFor(type: AcrossTimeObservation['type']): string {
  switch (type) {
    case 'gone_quiet':         return '#888780';
    case 'wondering_about':    return '#ef9f27';
    case 'whats_pulling_you':  return '#5dcaa5';
    case 'thinking_texture':   return '#378add';
    case 'stated_vs_actual':   return '#c89b6e';
    case 'recurring_cast':     return '#d4537e';
    case 'mind_moving':        return '#378add';
    case 'first_impression':   return '#7f77dd';
    case 'texture_early':      return '#888780';
    default:                   return '#888780';
  }
}

export function typeLabelFor(type: AcrossTimeObservation['type']): string {
  switch (type) {
    case 'gone_quiet':         return 'gone quiet';
    case 'wondering_about':    return 'a question forming';
    case 'whats_pulling_you':  return "what's pulling you";
    case 'thinking_texture':   return 'how your mind moves';
    case 'stated_vs_actual':   return 'a gap worth noticing';
    case 'recurring_cast':     return 'who shows up';
    case 'mind_moving':        return 'how your mind moves';
    case 'first_impression':   return 'first read';
    case 'texture_early':      return 'how you show up';
    default:                   return '';
  }
}

function trimToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(' ') + '…';
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.split('\n')[0].trim();
}

function firstClause(text: string): string {
  const match = text.match(/^[^,.;—–]+/);
  return match ? match[0].trim() : text.trim();
}

export function deriveHeadline(obs: AcrossTimeObservation): string {
  const body = (obs.body ?? '').trim();
  const title = (obs.title ?? '').trim();

  // Always-available fallback so callers never get an empty string
  const fallback = title || trimToWords(body, 10);

  switch (obs.type) {
    case 'gone_quiet': {
      const daysMatch = body.match(/(\d+)\s+days?\s+ago/i);
      // straight and curly quotes for topic extraction
      const topicMatch = body.match(/["""]([^"""]+)["""]/);
      const topic = topicMatch ? topicMatch[1] : (title || trimToWords(firstClause(body), 5));
      if (daysMatch) return `${topic} — last mentioned ${daysMatch[1]} days ago.`;
      return trimToWords(firstSentence(body), 10) || fallback;
    }

    case 'thinking_texture':
    case 'mind_moving':
      return trimToWords(firstSentence(body), 9) || fallback;

    case 'wondering_about':
    case 'stated_vs_actual':
      return trimToWords(firstSentence(body), 10) || fallback;

    case 'recurring_cast': {
      const first = firstSentence(body);
      const char = trimToWords(
        first.replace(/^(They|He|She|This person)\s+/i, ''),
        7,
      );
      return char ? `${title} — ${char}` : fallback;
    }

    case 'whats_pulling_you':
      return ''; // intentional — uses two-column layout instead

    default:
      return trimToWords(firstSentence(body), 10) || fallback;
  }
}

export function deriveCountLine(obs: AcrossTimeObservation): string {
  const body = obs.body.trim();

  switch (obs.type) {
    case 'gone_quiet': {
      const m = body.match(/was\s+(?:loud|common|frequent|prominent)[^.]+\./i);
      return m ? m[0].trim() : obs.window;
    }
    case 'thinking_texture':
    case 'mind_moving': {
      const m = body.match(/\b\d+%|\b\d+\s+(?:out of|times|entries)/i);
      return m ? m[0] : obs.window;
    }
    case 'wondering_about':
    case 'stated_vs_actual': {
      const parts = body.match(/\b\w+:\s*\d+\s+entr(?:y|ies)/gi);
      if (parts && parts.length >= 2) return parts.join(' · ');
      const m = body.match(/(\d+)\s+entries?/i);
      return m ? `${m[1]} entries` : obs.window;
    }
    case 'recurring_cast': {
      const m = body.match(/(\d+)\s+entries?/i);
      return m ? `in ${m[1]} entries` : obs.window;
    }

    default:
      return obs.window;
  }
}

// ── self_language phrase parser ───────────────────────────────────────────────

export function parseSelfLanguagePhrases(body: string): string[] {
  return body
    .split('\n')
    .map(l => l.trim().replace(/^[-•·*]\s*/, '').replace(/^[""]|[""]$/g, ''))
    .filter(l => l.length > 4);
}

// ── whats_pulling_you parser ─────────────────────────────────────────────────

export interface TowardAwayItems {
  toward: string[];
  away: string[];
}

export function parseTowardAway(body: string): TowardAwayItems {
  const toward: string[] = [];
  const away: string[] = [];

  // Collect "move(s) toward …" / "drawn toward …" phrases
  const towardRe = /(?:moves?\s+toward|drawn\s+toward|gravitates?\s+toward|leans?\s+toward|seeks?|embrace[sd]?)\s+([^,.;—–]+)/gi;
  for (const m of body.matchAll(towardRe)) {
    const raw = m[1].replace(/\s+/g, ' ').trim();
    if (raw.length > 2 && raw.length < 60) toward.push(raw);
  }

  // Collect "tends to avoid …" / "resists …" / "pulls away from …" phrases
  const awayRe = /(?:tends?\s+to\s+avoid|avoids?|resists?|pulls?\s+away\s+from|stays?\s+away\s+from)\s+([^,.;—–]+)/gi;
  for (const m of body.matchAll(awayRe)) {
    const raw = m[1].replace(/\s+/g, ' ').trim();
    if (raw.length > 2 && raw.length < 60) away.push(raw);
  }

  // Fallback: classify sentences by keyword
  if (toward.length === 0 && away.length === 0) {
    const sentences = body.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 8);
    for (const s of sentences) {
      const lower = s.toLowerCase();
      if (/toward|aspir|excit|seek|creat|new|grow|connect/.test(lower)) {
        toward.push(trimToWords(s, 7));
      } else if (/avoid|resist|away|discomfort|routine|bureauc|drain|overwhelm/.test(lower)) {
        away.push(trimToWords(s, 7));
      } else {
        (toward.length <= away.length ? toward : away).push(trimToWords(s, 7));
      }
    }
  }

  return {
    toward: (toward.length > 0 ? toward : ['new challenges']).slice(0, 3),
    away:   (away.length   > 0 ? away   : ['routine']).slice(0, 3),
  };
}

// ── thinking_texture bar ──────────────────────────────────────────────────────

export interface TextureBar {
  leftLabel: string;
  rightLabel: string;
  // proportions as flex values (sum = 10)
  leftFlex: number;
  midFlex: number;
  rightFlex: number;
}

export function deriveTextureBar(obs: AcrossTimeObservation): TextureBar {
  const body = obs.body.toLowerCase();

  // Quick resolve / sit-with-it axis
  if (/resolv|fast|quickly|immediate/.test(body) && /sit with|linger|revisit|circle/.test(body)) {
    return { leftLabel: 'resolves fast', rightLabel: 'sits with it', leftFlex: 2, midFlex: 6, rightFlex: 2 };
  }
  if (/verbal|spoken|talk|speak/.test(body) && /written|typing|text|wrote/.test(body)) {
    return { leftLabel: 'verbal', rightLabel: 'written', leftFlex: 3, midFlex: 4, rightFlex: 3 };
  }
  if (/analyz|logic|reason/.test(body) && /feel|emotion|intuiti/.test(body)) {
    return { leftLabel: 'analytical', rightLabel: 'intuitive', leftFlex: 2, midFlex: 6, rightFlex: 2 };
  }
  // default: "circles before landing"
  return { leftLabel: 'circles first', rightLabel: 'lands quickly', leftFlex: 2, midFlex: 6, rightFlex: 2 };
}
