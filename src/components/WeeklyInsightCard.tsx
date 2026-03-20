import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { WeeklyInsight } from '../types';
import { generateWeeklyInsight, NOT_ENOUGH_DATA } from '../services/WeeklyInsightService';
import { renderInsightSections } from './InsightSections';

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function WeeklyInsightCard() {
  const [insight, setInsight] = useState<WeeklyInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [notEnoughData, setNotEnoughData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loadInsight(false);
  }, []);

  useEffect(() => {
    if (loading) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.9, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(0.4);
    }
  }, [loading]);

  const loadInsight = async (force: boolean) => {
    setError(null);
    setNotEnoughData(false);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await generateWeeklyInsight(force);
      setInsight(result);
    } catch (e: any) {
      if (e?.message === NOT_ENOUGH_DATA) {
        setNotEnoughData(true);
      } else {
        setError(e?.message ?? 'Could not load weekly insight.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Heading row */}
      <View style={styles.headingRow}>
        <Text style={styles.heading}>How I've been doing this week</Text>
        <TouchableOpacity
          onPress={() => loadInsight(true)}
          disabled={refreshing || loading}
          style={styles.refreshBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {refreshing
            ? <ActivityIndicator size="small" color="#818cf8" />
            : <Text style={styles.refreshIcon}>↻</Text>}
        </TouchableOpacity>
      </View>

      {/* Loading skeleton */}
      {loading && (
        <View>
          {(['95%', '88%', '72%', '60%'] as const).map((w, i) => (
            <Animated.View
              key={i}
              style={[styles.skeletonLine, { width: w, opacity: pulseAnim }]}
            />
          ))}
        </View>
      )}

      {/* Not enough data */}
      {!loading && notEnoughData && (
        <Text style={styles.emptyText}>
          Keep journaling — weekly insights appear once you have summaries from at least 2 days this week.
        </Text>
      )}

      {/* Error */}
      {!loading && error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      {/* Loaded */}
      {!loading && insight && (
        <>
          {renderInsightSections(insight.insightText)}
          <Text style={styles.lastUpdated}>
            Updated {formatRelativeTime(insight.generatedAt)}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#818cf8',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: { color: '#9ca3af', fontSize: 15, fontWeight: '700' },

  lastUpdated: {
    fontSize: 11,
    color: '#374151',
    marginTop: 12,
    textAlign: 'right',
  },

  skeletonLine: {
    height: 13,
    backgroundColor: '#1f2d4e',
    borderRadius: 7,
    marginBottom: 9,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: 8,
  },
  errorText: { fontSize: 14, color: '#f87171', lineHeight: 22 },
});
