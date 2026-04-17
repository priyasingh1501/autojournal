/**
 * WeekReviewView — the "Week" toggle content inside JournalScreen.
 *
 * Renders a cached WeekReview (from SummaryService.getCachedWeekReview) if
 * present, otherwise generates one on mount. Sundays-ish show the current
 * week; earlier in the week the review is sparse by design (few days
 * logged) so we surface the generator state rather than a blank screen.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { WeekReview } from '../types';
import {
  generateWeekReview,
  getCachedWeekReview,
  mondayOf,
  WEEK_REVIEW_NOT_ENOUGH,
} from '../services/SummaryService';
import { track } from '../services/AnalyticsService';

interface Props {
  /** The date the user is viewing (YYYY-MM-DD). Used to derive the week. */
  anchorDate: string;
  /** Opens the Day view for a specific date when the user taps a day row. */
  onOpenDay: (date: string) => void;
}

function fmtShort(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtWeekday(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });
}

export default function WeekReviewView({ anchorDate, onOpenDay }: Props) {
  const weekStart = mondayOf(anchorDate);

  const [review, setReview]   = useState<WeekReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cached = await getCachedWeekReview(weekStart);
      if (cached) {
        setReview(cached);
        return;
      }
      const fresh = await generateWeekReview(weekStart);
      setReview(fresh);
    } catch (e: any) {
      setError(e?.message ?? 'Could not generate week review.');
      setReview(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    track('week_review_opened');
    load();
  }, [load]);

  const regenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await generateWeekReview(weekStart);
      setReview(fresh);
    } catch (e: any) {
      setError(e?.message ?? 'Could not generate week review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekLabel}>WEEK OF</Text>
          <Text style={styles.weekDates}>
            {fmtShort(weekStart)} – {fmtShort(mondayAdd6(weekStart))}
          </Text>
        </View>
        <TouchableOpacity
          onPress={regenerate}
          disabled={loading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {loading
            ? <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
            : <Text style={styles.regenLink}>Regenerate</Text>}
        </TouchableOpacity>
      </View>

      {error === WEEK_REVIEW_NOT_ENOUGH ? (
        <View style={styles.empty}>
          <Feather name="feather" size={28} color="rgba(152,212,250,0.35)" />
          <Text style={styles.emptyTitle}>Not enough of the week yet</Text>
          <Text style={styles.emptyBody}>
            Your week review appears on Sunday evening, once at least three days
            this week have notes.
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={13} color="rgba(252,165,165,0.80)" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !review ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="rgba(152,212,250,0.70)" />
          <Text style={styles.loadingText}>Looking back across your week…</Text>
        </View>
      ) : (
        <>
          {review.reflection ? (
            <Text style={styles.reflection}>{review.reflection}</Text>
          ) : null}

          <Text style={styles.daysLabel}>DAY BY DAY</Text>
          {review.days.length === 0 ? (
            <Text style={styles.emptyBody}>
              No day-by-day lines yet. Try regenerating when more of the week has entries.
            </Text>
          ) : (
            review.days.map((d) => (
              <TouchableOpacity
                key={d.date}
                style={styles.dayRow}
                onPress={() => onOpenDay(d.date)}
                activeOpacity={0.7}
              >
                <View style={styles.dayLeft}>
                  <Text style={styles.dayName}>{fmtWeekday(d.date)}</Text>
                  <Text style={styles.dayDate}>{fmtShort(d.date)}</Text>
                </View>
                <Text style={styles.dayOneLiner} numberOfLines={3}>
                  {d.oneLiner}
                </Text>
                <Feather name="chevron-right" size={14} color="rgba(152,212,250,0.45)" />
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.footer}>
            {review.entryCount} entr{review.entryCount === 1 ? 'y' : 'ies'} across {review.days.length} day{review.days.length === 1 ? '' : 's'}. Observations, not conclusions.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// Co-located helper — week end is 6 days after the Monday.
function mondayAdd6(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  weekLabel: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152, 212, 250, 0.55)',
    fontFamily: 'GillSans-Light',
  },
  weekDates: {
    fontSize: 20, fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.95)',
    marginTop: 2,
  },
  regenLink: {
    fontSize: 13, color: 'rgba(152, 212, 250, 0.75)',
    fontFamily: 'GillSans-Light',
  },

  reflection: {
    fontSize: 16, lineHeight: 25,
    color: 'rgba(224,242,254,0.90)',
    fontFamily: 'Baskerville',
    marginBottom: 24,
  },

  daysLabel: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: '500',
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
    marginBottom: 10, marginTop: 4,
  },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: 'rgba(3, 18, 40, 0.55)',
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)',
    marginBottom: 8,
  },
  dayLeft: { width: 54 },
  dayName: {
    fontSize: 13, fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.90)',
  },
  dayDate: {
    fontSize: 10, letterSpacing: 0.3,
    color: 'rgba(152,212,250,0.50)',
    fontFamily: 'GillSans-Light',
    textTransform: 'uppercase',
  },
  dayOneLiner: {
    flex: 1,
    fontSize: 13, lineHeight: 19,
    color: 'rgba(224,242,254,0.80)',
    fontFamily: 'GillSans-Light',
  },

  footer: {
    marginTop: 24,
    fontSize: 12, lineHeight: 18,
    color: 'rgba(152,212,250,0.48)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
  },

  empty: {
    alignItems: 'center', gap: 8,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.88)',
  },
  emptyBody: {
    fontSize: 13, lineHeight: 20,
    color: 'rgba(152,212,250,0.65)',
    fontFamily: 'GillSans-Light',
    textAlign: 'center',
    paddingHorizontal: 10,
  },

  loadingBox: {
    alignItems: 'center', gap: 10, paddingVertical: 40,
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(152,212,250,0.55)',
    fontFamily: 'GillSans-Light',
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(252,165,165,0.08)',
    borderWidth: 1, borderColor: 'rgba(252,165,165,0.25)',
  },
  errorText: {
    flex: 1, fontSize: 12,
    color: 'rgba(252,165,165,0.80)',
    fontFamily: 'GillSans-Light',
  },
});
