import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { navigationRef } from '../../App';
import {
  generateEmotionAnalysis,
  generateThoughtPatternAnalysis,
  generatePersonalityAnalysis,
  generateGrowthTips,
  NOT_ENOUGH_DATA,
} from '../services/InsightAnalysisService';
import {
  EmotionAnalysis, ThoughtPatternAnalysis, PersonalityAnalysis, GrowthTipsAnalysis,
} from '../types';
import TimeframeSelector from '../components/insights/TimeframeSelector';
import EmotionTimeline from '../components/insights/EmotionTimeline';
import ThoughtPatternList from '../components/insights/ThoughtPatternList';
import PersonalityRadar from '../components/insights/PersonalityRadar';
import GrowthTipsList from '../components/insights/GrowthTipsList';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = 'emotions' | 'patterns' | 'personality' | 'growth';
type Timeframe = 30 | 90 | 180;

const TABS: { key: TabKey; label: string; icon: string; tagline: string }[] = [
  { key: 'emotions',    label: 'Emotions',    icon: 'heart',        tagline: 'Reveal the emotions behind your thoughts'   },
  { key: 'patterns',   label: 'Patterns',    icon: 'repeat',       tagline: 'Discover your top thought patterns'         },
  { key: 'personality',label: 'Personality', icon: 'user',         tagline: 'Mirror for your personality'               },
  { key: 'growth',     label: 'Growth',      icon: 'trending-up',  tagline: 'Personal growth on autopilot'              },
];

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.80, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      {(['100%', '80%', '65%', '90%', '70%'] as const).map((w, i) => (
        <Animated.View key={i} style={[styles.skeletonLine, { width: w, opacity: anim }]} />
      ))}
    </View>
  );
}

// ── Empty / Error ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Feather name="bar-chart-2" size={36} color="rgba(152,212,250,0.25)" />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const [activeTab,  setActiveTab]  = useState<TabKey>('emotions');
  const [timeframe,  setTimeframe]  = useState<Timeframe>(30);

  const [emotionData,     setEmotionData]     = useState<EmotionAnalysis | null>(null);
  const [patternData,     setPatternData]     = useState<ThoughtPatternAnalysis | null>(null);
  const [personalityData, setPersonalityData] = useState<PersonalityAnalysis | null>(null);
  const [growthData,      setGrowthData]      = useState<GrowthTipsAnalysis | null>(null);

  const [loading,  setLoading]  = useState<Record<TabKey, boolean>>({ emotions: false, patterns: false, personality: false, growth: false });
  const [errors,   setErrors]   = useState<Record<TabKey, string | null>>({ emotions: null, patterns: null, personality: null, growth: null });
  const [noData,   setNoData]   = useState<Record<TabKey, boolean>>({ emotions: false, patterns: false, personality: false, growth: false });
  const [growthRefreshing, setGrowthRefreshing] = useState(false);

  const setTabLoading = (tab: TabKey, v: boolean) => setLoading(l => ({ ...l, [tab]: v }));
  const setTabError   = (tab: TabKey, v: string | null) => setErrors(e => ({ ...e, [tab]: v }));
  const setTabNoData  = (tab: TabKey, v: boolean) => setNoData(n => ({ ...n, [tab]: v }));

  const jumpToDate = useCallback((date: string) => {
    navigationRef.current?.navigate('Summary', { jumpToDate: date });
  }, []);

  const loadTab = useCallback(async (tab: TabKey, tf: Timeframe, force = false) => {
    setTabLoading(tab, true);
    setTabError(tab, null);
    setTabNoData(tab, false);
    try {
      switch (tab) {
        case 'emotions':    setEmotionData(await generateEmotionAnalysis(tf, force));       break;
        case 'patterns':    setPatternData(await generateThoughtPatternAnalysis(tf, force)); break;
        case 'personality': setPersonalityData(await generatePersonalityAnalysis(force));   break;
        case 'growth':      setGrowthData(await generateGrowthTips(force));                  break;
      }
    } catch (e: any) {
      if (e?.message === NOT_ENOUGH_DATA) setTabNoData(tab, true);
      else setTabError(tab, e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setTabLoading(tab, false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadTab(activeTab, timeframe);
  }, [activeTab, timeframe]));

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const needsData = tab === 'emotions'    ? !emotionData
                    : tab === 'patterns'    ? !patternData
                    : tab === 'personality' ? !personalityData
                    : !growthData;
    if (needsData) loadTab(tab, timeframe);
  };

  const handleTimeframeChange = (tf: Timeframe) => {
    setTimeframe(tf);
    if (activeTab === 'emotions')  setEmotionData(null);
    if (activeTab === 'patterns')  setPatternData(null);
    loadTab(activeTab, tf);
  };

  const handleRefresh = () => loadTab(activeTab, timeframe, true);

  const handleGrowthRefresh = async () => {
    setGrowthRefreshing(true);
    await loadTab('growth', timeframe, true);
    setGrowthRefreshing(false);
  };

  const currentTab = TABS.find(t => t.key === activeTab)!;
  const isLoading = loading[activeTab];
  const hasError  = errors[activeTab];
  const hasNoData = noData[activeTab];
  const hasData   = activeTab === 'emotions'    ? !!emotionData
                  : activeTab === 'patterns'    ? !!patternData
                  : activeTab === 'personality' ? !!personalityData
                  : !!growthData;

  return (
    <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Insights</Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleRefresh}
            disabled={isLoading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="rgba(152,212,250,0.85)" />
              : <Feather name="refresh-cw" size={14} color="rgba(152,212,250,0.65)" />}
          </TouchableOpacity>
        </View>

        {/* Tab pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabPill, activeTab === t.key && styles.tabPillActive]}
              onPress={() => handleTabChange(t.key)}
              activeOpacity={0.75}
            >
              <Feather
                name={t.icon as any}
                size={13}
                color={activeTab === t.key ? 'rgba(224,242,254,0.95)' : 'rgba(152,212,250,0.50)'}
              />
              <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.tagline}>{currentTab.tagline}</Text>

          {/* Timeframe (emotions + patterns only) */}
          {(activeTab === 'emotions' || activeTab === 'patterns') && (
            <TimeframeSelector selected={timeframe} onChange={handleTimeframeChange} />
          )}

          {isLoading && <Skeleton />}
          {!isLoading && hasNoData && (
            <EmptyState message="Keep journaling — this insight appears once you have at least 3 daily summaries." />
          )}
          {!isLoading && hasError && !hasNoData && <EmptyState message={hasError} />}
          {!isLoading && hasData && !hasError && (
            <>
              {activeTab === 'emotions'    && emotionData     && <EmotionTimeline    data={emotionData}     onJumpToDate={jumpToDate} />}
              {activeTab === 'patterns'    && patternData     && <ThoughtPatternList data={patternData}     onJumpToDate={jumpToDate} />}
              {activeTab === 'personality' && personalityData && <PersonalityRadar   data={personalityData} />}
              {activeTab === 'growth'      && growthData      && (
                <GrowthTipsList
                  data={growthData}
                  onRefresh={handleGrowthRefresh}
                  refreshing={growthRefreshing}
                />
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 26, fontFamily: 'Baskerville', fontWeight: '500',
    color: 'rgba(224,242,254,0.95)',
  },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(6,26,55,0.55)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  tabScroll: { maxHeight: 52 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, paddingBottom: 12 },
  tabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 22, borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.15)',
    backgroundColor: 'rgba(152,212,250,0.05)',
  },
  tabPillActive: {
    backgroundColor: 'rgba(152,212,250,0.16)',
    borderColor: 'rgba(152,212,250,0.45)',
  },
  tabLabel: { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)' },
  tabLabelActive: { color: 'rgba(224,242,254,0.95)' },

  content: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingBottom: 40 },

  tagline: {
    fontSize: 13, fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.55)', marginBottom: 18, fontStyle: 'italic',
  },

  skeletonLine: { height: 14, backgroundColor: 'rgba(9,41,173,0.10)', borderRadius: 7 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  emptyText: {
    fontSize: 14, color: 'rgba(152,212,250,0.55)', fontFamily: 'GillSans-Light',
    textAlign: 'center', lineHeight: 22, maxWidth: 280,
  },
});
