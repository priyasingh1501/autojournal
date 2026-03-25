import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FreshnessConfig } from '../../services/InsightV2Service';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  config:                  FreshnessConfig;
  generatedAt:             number;
  entryCountAtGeneration:  number;
  currentEntryCount:       number;
  onRefresh?:              () => void;
  refreshing?:             boolean;
}

function timeAgo(ts: number): string {
  const mins  = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 2)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function InsightFreshnessBadge({
  config,
  generatedAt,
  entryCountAtGeneration,
  currentEntryCount,
  onRefresh,
  refreshing,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const newEntries      = Math.max(0, currentEntryCount - entryCountAtGeneration);
  const entryProgress   = Math.min(newEntries / config.entryThreshold, 1);
  const daysElapsed     = (Date.now() - generatedAt) / 86_400_000;
  const timeProgress    = Math.min(daysElapsed / config.maxAgeDays, 1);
  const overallProgress = Math.max(entryProgress, timeProgress);

  // Status colour
  const statusColor =
    overallProgress >= 1.0 ? 'rgba(251,191,36,0.90)'   // stale — amber
  : overallProgress >= 0.7 ? 'rgba(251,191,36,0.65)'   // getting there
  :                           'rgba(110,231,183,0.75)'; // fresh — green

  const statusLabel =
    overallProgress >= 1.0 ? 'Refresh available'
  : overallProgress >= 0.7 ? 'Almost due for refresh'
  :                           'Up to date';

  function toggle() {
    LayoutAnimation.easeInEaseOut();
    setExpanded(v => !v);
  }

  return (
    <View style={s.wrap}>
      {/* Collapsed summary row */}
      <TouchableOpacity style={s.row} onPress={toggle} activeOpacity={0.7}>
        <View style={[s.dot, { backgroundColor: statusColor }]} />
        <Text style={[s.status, { color: statusColor }]}>{statusLabel}</Text>
        <Text style={s.meta}>
          {config.windowLabel} window · updated {timeAgo(generatedAt)}
        </Text>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={11}
          color="rgba(152,212,250,0.35)"
        />
      </TouchableOpacity>

      {/* Expanded detail */}
      {expanded && (
        <View style={s.detail}>
          <Text style={s.rationale}>{config.rationale}</Text>

          {/* Entry count progress */}
          <View style={s.progressBlock}>
            <View style={s.progressRow}>
              <Text style={s.progressLabel}>New entries since last update</Text>
              <Text style={s.progressCount}>
                {newEntries} / {config.entryThreshold}
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, {
                width: `${Math.round(entryProgress * 100)}%` as any,
                backgroundColor: statusColor,
              }]} />
            </View>
          </View>

          {/* Time progress */}
          <View style={s.progressBlock}>
            <View style={s.progressRow}>
              <Text style={s.progressLabel}>Days since last update</Text>
              <Text style={s.progressCount}>
                {Math.floor(daysElapsed)} / {config.maxAgeDays}d
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, {
                width: `${Math.round(timeProgress * 100)}%` as any,
                backgroundColor: 'rgba(147,197,253,0.55)',
              }]} />
            </View>
          </View>

          {onRefresh && (
            <TouchableOpacity
              style={[s.refreshBtn, refreshing && s.refreshBtnLoading]}
              onPress={onRefresh}
              disabled={refreshing}
              activeOpacity={0.75}
            >
              <Feather
                name="refresh-cw"
                size={12}
                color={refreshing ? 'rgba(152,212,250,0.35)' : 'rgba(152,212,250,0.85)'}
              />
              <Text style={[s.refreshText, refreshing && { color: 'rgba(152,212,250,0.35)' }]}>
                {refreshing ? 'Refreshing…' : 'Refresh now'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:          { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.10)', backgroundColor: 'rgba(152,212,250,0.03)', overflow: 'hidden' },

  row:           { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9 },
  dot:           { width: 6, height: 6, borderRadius: 3 },
  status:        { fontSize: 11, fontFamily: 'GillSans-Light', fontWeight: '500' },
  meta:          { flex: 1, fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)' },

  detail:        { paddingHorizontal: 12, paddingBottom: 12, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(152,212,250,0.08)', paddingTop: 10 },
  rationale:     { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', lineHeight: 17 },

  progressBlock: { gap: 5 },
  progressRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 },
  progressCount: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.65)' },
  track:         { height: 3, backgroundColor: 'rgba(152,212,250,0.08)', borderRadius: 2, overflow: 'hidden' },
  fill:          { height: '100%', borderRadius: 2 },

  refreshBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2, backgroundColor: 'rgba(152,212,250,0.06)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)', paddingHorizontal: 10, paddingVertical: 6 },
  refreshBtnLoading: { opacity: 0.5 },
  refreshText:       { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.85)' },
});
