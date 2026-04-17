/**
 * ActionablesCard
 *
 * Displays a goal, an action, and a reflection question derived from the
 * user's recent journal entries. Shown on HomeScreen below the MonthlyInsightCard.
 *
 * Refreshes whenever `refreshKey` changes (passed from HomeScreen after new entries).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ActionablesService, Actionables } from '../services/ActionablesService';

interface Props {
  refreshKey: number;
}

export default function ActionablesCard({ refreshKey }: Props) {
  const [data, setData]       = useState<Actionables | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const result = await ActionablesService.get(force);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [refreshKey]);

  // Don't render anything if no data and not loading
  if (!loading && !data) return null;

  return (
    <View style={styles.card}>
      {/* Header row */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <Text style={styles.headerLabel}>From your entries</Text>
        <View style={styles.headerRight}>
          {loading && <ActivityIndicator size="small" color="rgba(152,212,250,0.45)" style={{ marginRight: 8 }} />}
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="rgba(152,212,250,0.35)"
          />
        </View>
      </TouchableOpacity>

      {expanded && data && (
        <View style={styles.body}>
          {/* Goal */}
          <View style={styles.row}>
            <View style={[styles.iconWrap, styles.iconGoal]}>
              <Feather name="flag" size={12} color="rgba(152,212,250,0.80)" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.rowLabel}>Goal worth pursuing</Text>
              <Text style={styles.rowText}>{data.goal}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Action */}
          <View style={styles.row}>
            <View style={[styles.iconWrap, styles.iconAction]}>
              <Feather name="arrow-right-circle" size={12} color="rgba(130,200,130,0.80)" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.rowLabel}>Try this</Text>
              <Text style={styles.rowText}>{data.action}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Question */}
          <View style={styles.row}>
            <View style={[styles.iconWrap, styles.iconQuestion]}>
              <Feather name="help-circle" size={12} color="rgba(200,160,250,0.80)" />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.rowLabel}>Sit with this</Text>
              <Text style={styles.rowText}>{data.question}</Text>
            </View>
          </View>

          {/* Refresh button */}
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => load(true)}
            activeOpacity={0.7}
          >
            <Feather name="refresh-cw" size={11} color="rgba(152,212,250,0.30)" style={{ marginRight: 5 }} />
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: 'rgba(3, 12, 28, 0.78)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.13)',
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.45)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  body: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 12,
  },

  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  iconGoal: {
    backgroundColor: 'rgba(152,212,250,0.08)',
  },
  iconAction: {
    backgroundColor: 'rgba(130,200,130,0.08)',
  },
  iconQuestion: {
    backgroundColor: 'rgba(200,160,250,0.08)',
  },

  textWrap: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 10,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.38)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  rowText: {
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.85)',
    lineHeight: 20,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(152,212,250,0.07)',
    marginLeft: 38,
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  refreshText: {
    fontSize: 11,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.30)',
  },
});
