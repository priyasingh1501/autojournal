import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import {
  generateWhoYouAre, generateWhatYouCare,
  generateHowYouThink, generateYourStory,
  NOT_ENOUGH_DATA, FRESHNESS,
} from '../services/InsightV2Service';
import InsightFreshnessBadge from '../components/insights/InsightFreshnessBadge';
import { StorageService } from '../services/StorageService';
import {
  WhoYouAreAnalysis, WhatYouCareAboutAnalysis,
  HowYouThinkAnalysis, YourStoryAnalysis, EnneagramResponse,
} from '../types';

import WhoYouAreTab          from '../components/insights/WhoYouAreTab';
import ValuesConstellationTab from '../components/insights/ValuesConstellationTab';
import HowYouThinkTab        from '../components/insights/HowYouThinkTab';
import YourStoryTab          from '../components/insights/YourStoryTab';

// ── Tab definitions ────────────────────────────────────────────────────────────

type TabKey = 'you' | 'values' | 'thinking' | 'story';

// Ordered by update frequency — most dynamic first
const TABS: { key: TabKey; label: string; icon: string; full: string; sub: string }[] = [
  { key: 'values',   label: 'Values',   icon: 'heart',   full: 'What I Care About',   sub: 'Values · Motivation'  }, // 10 entries / 14d
  { key: 'you',      label: 'Me',       icon: 'user',    full: 'Who I Am',            sub: 'Big Five · Enneagram' }, // 20 entries / 30d
  { key: 'thinking', label: 'Thinking', icon: 'cpu',     full: 'How I Think',         sub: 'Cognitive styles'     }, // 25 entries / 30d
  { key: 'story',    label: 'Story',    icon: 'book',    full: 'My Story',            sub: 'Chapter · Arc'        }, // 30 entries / 30d
];

// ── Empty / error states ───────────────────────────────────────────────────────

function EmptyState({ noData, onGenerate, loading }: {
  noData: boolean; onGenerate: () => void; loading: boolean;
}) {
  return (
    <View style={es.wrap}>
      <Feather name="feather" size={40} color="rgba(152,212,250,0.30)" style={{ marginBottom: 16 }} />
      {noData ? (
        <>
          <Text style={es.title}>Not enough entries yet</Text>
          <Text style={es.sub}>Journal for at least 3 days and come back.</Text>
        </>
      ) : (
        <>
          <Text style={es.title}>Ready to generate</Text>
          <Text style={es.sub}>Claude will read your recent entries and build this portrait.</Text>
          <TouchableOpacity style={es.btn} onPress={onGenerate} disabled={loading} activeOpacity={0.8}>
            {loading
              ? <ActivityIndicator size="small" color="rgba(224,242,254,0.80)" />
              : <Text style={es.btnText}>Generate now</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const es = StyleSheet.create({
  wrap:    { paddingTop: 60, alignItems: 'center', gap: 8 },
  title:   { fontSize: 18, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.88)' },
  sub:     { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', textAlign: 'center', lineHeight: 20 },
  btn:     { marginTop: 16, backgroundColor: '#0929AD', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)' },
  btnText: { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.95)' },
});

// ── Main screen ────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<TabKey>('values');
  const scrollRef = useRef<ScrollView>(null);

  const [currentEntryCount, setCurrentEntryCount] = useState(0);

  // Per-tab data
  const [whoData,       setWhoData]       = useState<WhoYouAreAnalysis | null>(null);
  const [valuesData,    setValuesData]    = useState<WhatYouCareAboutAnalysis | null>(null);
  const [thinkData,     setThinkData]     = useState<HowYouThinkAnalysis | null>(null);
  const [storyData,     setStoryData]     = useState<YourStoryAnalysis | null>(null);
  const [enneagramResp, setEnneagramResp] = useState<EnneagramResponse | null>(null);

  // Per-tab status
  const [loading, setLoading] = useState<Partial<Record<TabKey, boolean>>>({});
  const [error,   setError]   = useState<Partial<Record<TabKey, string>>>({});
  const [noData,  setNoData]  = useState<Partial<Record<TabKey, boolean>>>({});

  // Load enneagram + entry count once on first focus (not on every tab switch).
  const bootstrappedRef = React.useRef(false);
  useFocusEffect(useCallback(() => {
    tryLoadCached(activeTab);
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      StorageService.getEnneagramResponse().then(r => r && setEnneagramResp(r));
      StorageService.getSummaryDates().then(d => setCurrentEntryCount(d.length));
    }
  }, [activeTab]));

  // Silently load from cache — no spinner, no auto-generate
  const tryLoadCached = async (tab: TabKey) => {
    try {
      if (tab === 'you'      && !whoData)    { const c = await StorageService.getWhoYouAre();   if (c) setWhoData(c); }
      if (tab === 'values'   && !valuesData) { const c = await StorageService.getWhatYouCare(); if (c) setValuesData(c); }
      if (tab === 'thinking' && !thinkData)  { const c = await StorageService.getHowYouThink(); if (c) setThinkData(c); }
      if (tab === 'story'    && !storyData)  { const c = await StorageService.getYourStory();   if (c) setStoryData(c); }
    } catch { /* ignore */ }
  };

  const generate = async (tab: TabKey) => {
    setLoading(p  => ({ ...p, [tab]: true  }));
    setError(p    => ({ ...p, [tab]: undefined }));
    setNoData(p   => ({ ...p, [tab]: false }));
    try {
      if (tab === 'you')      setWhoData(await generateWhoYouAre(true));
      if (tab === 'values')   setValuesData(await generateWhatYouCare(true));
      if (tab === 'thinking') setThinkData(await generateHowYouThink(true));
      if (tab === 'story')    setStoryData(await generateYourStory(true));
    } catch (e: any) {
      if (e?.message === NOT_ENOUGH_DATA) setNoData(p => ({ ...p, [tab]: true }));
      else setError(p => ({ ...p, [tab]: e?.message ?? 'Something went wrong.' }));
    } finally {
      setLoading(p => ({ ...p, [tab]: false }));
    }
  };

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // Try cache silently on first visit
    if (tab === 'you'      && !whoData)    tryLoadCached(tab);
    if (tab === 'values'   && !valuesData) tryLoadCached(tab);
    if (tab === 'thinking' && !thinkData)  tryLoadCached(tab);
    if (tab === 'story'    && !storyData)  tryLoadCached(tab);
  };

  const handleJump = (date: string) => {
    navigation.navigate('Summary', { jumpToDate: date });
  };

  const activeTabMeta = TABS.find(t => t.key === activeTab)!;
  const isLoading  = !!loading[activeTab];
  const tabError   = error[activeTab];
  const tabNoData  = !!noData[activeTab];

  const hasData = (tab: TabKey) =>
    tab === 'you' ? !!whoData : tab === 'values' ? !!valuesData :
    tab === 'thinking' ? !!thinkData : !!storyData;

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Insights</Text>
          <Text style={s.headerSub}>{activeTabMeta.full}</Text>
        </View>
        {hasData(activeTab) && (
          <TouchableOpacity
            onPress={() => generate(activeTab)}
            disabled={isLoading}
            style={s.refreshBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="rgba(152,212,250,0.65)" />
              : <Feather name="refresh-cw" size={15} color="rgba(152,212,250,0.65)" />}
          </TouchableOpacity>
        )}
      </View>

      {/* Pill tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.tabBar} contentContainerStyle={s.tabBarContent}
      >
        {TABS.map(t => {
          const active = t.key === activeTab;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => switchTab(t.key)}
              style={[s.tab, active && s.tabActive]}
              activeOpacity={0.7}
            >
              <Feather
                name={t.icon as any} size={13}
                color={active ? 'rgba(224,242,254,0.95)' : 'rgba(152,212,250,0.45)'}
              />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={s.tabSub}>{activeTabMeta.sub}</Text>

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={s.content}
        contentContainerStyle={s.contentPad}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color="rgba(152,212,250,0.60)" />
            <Text style={s.loadingText}>Claude is reading my entries…</Text>
          </View>
        )}

        {tabError && !isLoading && (
          <View style={s.errorRow}>
            <Text style={s.errorText}>{tabError}</Text>
            <TouchableOpacity onPress={() => generate(activeTab)} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !tabError && (
          <>
            {activeTab === 'you' && (
              whoData
                ? <>
                    <InsightFreshnessBadge
                      config={FRESHNESS.you}
                      generatedAt={whoData.generatedAt}
                      entryCountAtGeneration={whoData.entryCountAtGeneration ?? 0}
                      currentEntryCount={currentEntryCount}
                      onRefresh={() => generate('you')}
                      refreshing={!!loading['you']}
                    />
                    <WhoYouAreTab
                      data={whoData}
                      enneagramResponse={enneagramResp}
                      onEnneagramRespond={setEnneagramResp}
                      onJump={handleJump}
                    />
                  </>
                : <EmptyState noData={tabNoData} loading={isLoading} onGenerate={() => generate('you')} />
            )}
            {activeTab === 'values' && (
              valuesData
                ? <>
                    <InsightFreshnessBadge
                      config={FRESHNESS.values}
                      generatedAt={valuesData.generatedAt}
                      entryCountAtGeneration={valuesData.entryCountAtGeneration ?? 0}
                      currentEntryCount={currentEntryCount}
                      onRefresh={() => generate('values')}
                      refreshing={!!loading['values']}
                    />
                    <ValuesConstellationTab data={valuesData} onJump={handleJump} />
                  </>
                : <EmptyState noData={tabNoData} loading={isLoading} onGenerate={() => generate('values')} />
            )}
            {activeTab === 'thinking' && (
              thinkData
                ? <>
                    <InsightFreshnessBadge
                      config={FRESHNESS.thinking}
                      generatedAt={thinkData.generatedAt}
                      entryCountAtGeneration={thinkData.entryCountAtGeneration ?? 0}
                      currentEntryCount={currentEntryCount}
                      onRefresh={() => generate('thinking')}
                      refreshing={!!loading['thinking']}
                    />
                    <HowYouThinkTab data={thinkData} onJump={handleJump} />
                  </>
                : <EmptyState noData={tabNoData} loading={isLoading} onGenerate={() => generate('thinking')} />
            )}
            {activeTab === 'story' && (
              storyData
                ? <>
                    <InsightFreshnessBadge
                      config={FRESHNESS.story}
                      generatedAt={storyData.generatedAt}
                      entryCountAtGeneration={storyData.entryCountAtGeneration ?? 0}
                      currentEntryCount={currentEntryCount}
                      onRefresh={() => generate('story')}
                      refreshing={!!loading['story']}
                    />
                    <YourStoryTab data={storyData} onJump={handleJump} />
                  </>
                : <EmptyState noData={tabNoData} loading={isLoading} onGenerate={() => generate('story')} />
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#02060E' },

  header:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle:    { fontSize: 26, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)' },
  headerSub:      { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', marginTop: 2 },
  refreshBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(152,212,250,0.08)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },

  tabBar:         { flexGrow: 0, marginBottom: 0 },
  tabBarContent:  { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  tab:            { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(152,212,250,0.05)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)' },
  tabActive:      { backgroundColor: 'rgba(9,41,173,0.40)', borderColor: 'rgba(152,212,250,0.35)' },
  tabLabel:       { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)' },
  tabLabelActive: { color: 'rgba(224,242,254,0.95)' },

  tabSub:         { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, letterSpacing: 0.2 },

  content:        { flex: 1 },
  contentPad:     { paddingHorizontal: 20, paddingTop: 4 },

  loadingRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 40, justifyContent: 'center' },
  loadingText:    { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', fontStyle: 'italic' },

  errorRow:       { alignItems: 'center', gap: 10, paddingVertical: 32 },
  errorText:      { fontSize: 13, color: '#e63946', textAlign: 'center', fontFamily: 'GillSans-Light' },
  retryBtn:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(233,69,96,0.12)', borderWidth: 1, borderColor: 'rgba(233,69,96,0.30)' },
  retryText:      { fontSize: 13, color: '#e94560', fontFamily: 'GillSans-Light' },
});
