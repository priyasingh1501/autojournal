import React, { useState, useEffect, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
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
            ? <ActivityIndicator size="small" color="rgba(147, 210, 232, 0.85)" />
            : <Feather name="refresh-cw" size={13} color="rgba(147, 210, 232, 0.65)" />}
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
          Keep journaling — weekly insights appear once you have a summary for at least one day this week.
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
    backgroundColor: 'rgba(3, 18, 40, 0.72)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.13)',
    shadowColor: '#48cae4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heading: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(224, 242, 254, 0.95)',
    flex: 1,
    fontFamily: 'Avenir',
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(6, 26, 55, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(72, 202, 228, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastUpdated: {
    fontSize: 11,
    color: 'rgba(147, 210, 232, 0.60)',
    marginTop: 12,
    textAlign: 'right',
    fontFamily: 'Avenir',
  },

  skeletonLine: {
    height: 13,
    backgroundColor: 'rgba(0, 35, 102, 0.08)',
    borderRadius: 7,
    marginBottom: 9,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(147, 210, 232, 0.60)',
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: 8,
    fontStyle: 'italic',
    fontFamily: 'Avenir',
  },
  errorText: { fontSize: 14, color: '#e63946', lineHeight: 22, fontFamily: 'Avenir' },
});
