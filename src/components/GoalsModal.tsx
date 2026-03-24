import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorageService } from '../services/StorageService';
import { UserGoals, WaistEntry } from '../types';

// ── Reusable sub-components ───────────────────────────────────────────────────

/** 1-to-max row of tappable circles */
function DayPicker({ value, onChange, max = 7 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <View style={dp.row}>
      {Array.from({ length: max }, (_, i) => i + 1).map(d => {
        const on = d <= value;
        return (
          <TouchableOpacity
            key={d}
            onPress={() => onChange(value === d ? 0 : d)}
            style={[dp.circle, on ? dp.on : dp.off]}
            activeOpacity={0.7}
          >
            <Text style={[dp.label, on ? dp.labelOn : dp.labelOff]}>{d}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const dp = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 7, marginTop: 10, flexWrap: 'wrap' },
  circle:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  on:      { backgroundColor: 'rgba(9,41,173,0.50)', borderColor: 'rgba(152,212,250,0.65)' },
  off:     { backgroundColor: 'rgba(152,212,250,0.04)', borderColor: 'rgba(152,212,250,0.16)' },
  label:   { fontSize: 12, fontFamily: 'GillSans-Light' },
  labelOn: { color: 'rgba(224,242,254,0.95)' },
  labelOff:{ color: 'rgba(152,212,250,0.35)' },
});

/** Labelled numeric text input row */
function NumericField({
  label, value, onChange, placeholder, unit, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; unit: string; hint?: string;
}) {
  return (
    <View style={nf.wrap}>
      <Text style={nf.label}>{label}</Text>
      <View style={nf.row}>
        <TextInput
          style={nf.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(152,212,250,0.28)"
          keyboardType="numeric"
          returnKeyType="done"
        />
        <Text style={nf.unit}>{unit}</Text>
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x-circle" size={13} color="rgba(152,212,250,0.35)" />
          </TouchableOpacity>
        )}
      </View>
      {hint && <Text style={nf.hint}>{hint}</Text>}
    </View>
  );
}

const nf = StyleSheet.create({
  wrap:  { gap: 5 },
  label: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.4, textTransform: 'uppercase' },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(152,212,250,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.16)', paddingHorizontal: 14, paddingVertical: 10 },
  input: { flex: 1, fontSize: 17, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.95)', padding: 0 },
  unit:  { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)' },
  hint:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', lineHeight: 14 },
});

/** Coloured section card */
function Section({ icon, title, accent, children }: { icon: string; title: string; accent: string; children: React.ReactNode }) {
  const iconBg = accent.replace(/[\d.]+\)$/, '0.10)');
  return (
    <View style={[sec.card, { borderColor: accent.replace(/[\d.]+\)$/, '0.14)') }]}>
      <View style={sec.header}>
        <View style={[sec.iconWrap, { backgroundColor: iconBg }]}>
          <Feather name={icon as any} size={14} color={accent} />
        </View>
        <Text style={[sec.title, { color: accent }]}>{title}</Text>
      </View>
      <View style={sec.body}>{children}</View>
    </View>
  );
}

const sec = StyleSheet.create({
  card:    { borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(152,212,250,0.03)', padding: 16 },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  iconWrap:{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 13, fontFamily: 'Baskerville', fontWeight: '500' },
  body:    { gap: 12 },
});

/** Small phase milestone chip */
function PhaseBadge({ phase, target, current, unit }: { phase: string; target: number; current?: number; unit: string }) {
  const done = current != null && (unit === '%' ? current <= target : current >= target);
  return (
    <View style={[pb.chip, done && pb.done]}>
      <Text style={pb.phase}>{phase}</Text>
      <Text style={pb.target}>
        {unit === '%' ? `≤${target}${unit}` : `≥${target}${unit}`}
        {current != null ? ` · now ${current}${unit}` : ''}
      </Text>
      {done && <Feather name="check" size={10} color="rgba(110,231,183,0.90)" style={{ marginLeft: 4 }} />}
    </View>
  );
}

const pb = StyleSheet.create({
  chip:   { backgroundColor: 'rgba(152,212,250,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)', paddingHorizontal: 10, paddingVertical: 6 },
  done:   { borderColor: 'rgba(110,231,183,0.30)', backgroundColor: 'rgba(110,231,183,0.05)' },
  phase:  { fontSize: 9, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.4, textTransform: 'uppercase' },
  target: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.80)', marginTop: 1 },
});

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (goals: UserGoals) => void;
}

export default function GoalsModal({ visible, onClose, onSaved }: Props) {
  // Training
  const [strengthDays,    setStrengthDays]    = useState(0);
  const [cardioDays,      setCardioDays]      = useState(0);
  // Nutrition
  const [calories,        setCalories]        = useState('');
  const [protein,         setProtein]         = useState('');
  // Body metrics
  const [bodyFatTarget,   setBodyFatTarget]   = useState('');
  const [muscleTarget,    setMuscleTarget]    = useState('');
  const [waistTarget,     setWaistTarget]     = useState('');
  const [waistNow,        setWaistNow]        = useState('');
  // Spending
  const [spendBudget,     setSpendBudget]     = useState('');
  // Persisted state
  const [waistHistory,    setWaistHistory]    = useState<WaistEntry[]>([]);
  const [saving,          setSaving]          = useState(false);

  useEffect(() => { if (visible) load(); }, [visible]);

  const load = async () => {
    const g = await StorageService.getGoals();
    if (!g) return;
    if (g.strengthDaysPerWeek)   setStrengthDays(g.strengthDaysPerWeek);
    if (g.cardioDaysPerWeek)     setCardioDays(g.cardioDaysPerWeek);
    // legacy migration
    if (!g.strengthDaysPerWeek && g.workoutDaysPerWeek) setStrengthDays(g.workoutDaysPerWeek);
    if (g.dailyCalorieTarget)    setCalories(String(g.dailyCalorieTarget));
    if (g.dailyProteinTarget)    setProtein(String(g.dailyProteinTarget));
    if (g.bodyFatTargetPct)      setBodyFatTarget(String(g.bodyFatTargetPct));
    if (g.muscleMassTargetKg)    setMuscleTarget(String(g.muscleMassTargetKg));
    if (g.waistTargetCm)         setWaistTarget(String(g.waistTargetCm));
    if (g.waistHistory?.length)  setWaistHistory(g.waistHistory);
    if (g.monthlySpendBudget)    setSpendBudget(String(g.monthlySpendBudget));
  };

  const handleLogWaist = () => {
    const val = parseFloat(waistNow);
    if (isNaN(val) || val < 40 || val > 200) return;
    const today = new Date().toISOString().split('T')[0];
    setWaistHistory(prev => {
      const filtered = prev.filter(e => e.date !== today);
      return [...filtered, { date: today, cm: val }].sort((a, b) => a.date.localeCompare(b.date));
    });
    setWaistNow('');
  };

  const handleSave = async () => {
    setSaving(true);
    const g: UserGoals = {};
    if (strengthDays > 0)                        g.strengthDaysPerWeek  = strengthDays;
    if (cardioDays > 0)                          g.cardioDaysPerWeek    = cardioDays;
    const cal = parseFloat(calories);
    if (!isNaN(cal) && cal > 0)                  g.dailyCalorieTarget   = cal;
    const prot = parseFloat(protein);
    if (!isNaN(prot) && prot > 0)                g.dailyProteinTarget   = prot;
    const bf = parseFloat(bodyFatTarget);
    if (!isNaN(bf) && bf > 0)                    g.bodyFatTargetPct     = bf;
    const mus = parseFloat(muscleTarget);
    if (!isNaN(mus) && mus > 0)                  g.muscleMassTargetKg   = mus;
    const wt = parseFloat(waistTarget);
    if (!isNaN(wt) && wt > 0)                    g.waistTargetCm        = wt;
    if (waistHistory.length > 0)                  g.waistHistory         = waistHistory;
    const bud = parseFloat(spendBudget.replace(/,/g, ''));
    if (!isNaN(bud) && bud > 0)                  g.monthlySpendBudget   = bud;
    await StorageService.saveGoals(g);
    setSaving(false);
    onSaved(g);
    onClose();
  };

  const latestWaist = waistHistory.length > 0 ? waistHistory[waistHistory.length - 1] : null;
  const anySet = strengthDays > 0 || cardioDays > 0 || calories || protein || bodyFatTarget || spendBudget;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

            {/* Header */}
            <View style={s.header}>
              <View>
                <Text style={s.title}>Your Goals</Text>
                <Text style={s.subtitle}>Personalised to your recomposition plan</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
                <Feather name="x" size={18} color="rgba(152,212,250,0.70)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* ── Training ─────────────────────────────────────── */}
              <Section icon="activity" title="Training" accent="rgba(110,231,183,0.90)">
                <View>
                  <Text style={s.fieldLabel}>Strength sessions / week</Text>
                  <Text style={s.fieldHint}>Compound lifts — squats, deadlifts, rows, presses</Text>
                  <DayPicker value={strengthDays} onChange={setStrengthDays} />
                  {strengthDays > 0 && (
                    <Text style={s.goalSummary}>
                      <Text style={s.hi}>{strengthDays}×/week</Text>
                      {'  ·  '}
                      <Text style={s.hi}>~{strengthDays * 4} sessions</Text> this month
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={s.fieldLabel}>Low-intensity cardio / week</Text>
                  <Text style={s.fieldHint}>Walking, cycling, swimming — not HIIT</Text>
                  <DayPicker value={cardioDays} onChange={setCardioDays} max={7} />
                  {cardioDays > 0 && (
                    <Text style={s.goalSummary}>
                      <Text style={s.hi}>{cardioDays}×/week</Text>
                      {'  ·  targets visceral fat reduction'}
                    </Text>
                  )}
                </View>
              </Section>

              {/* ── Nutrition ─────────────────────────────────────── */}
              <Section icon="coffee" title="Nutrition" accent="rgba(251,191,36,0.90)">
                <NumericField
                  label="Daily calorie target"
                  value={calories}
                  onChange={setCalories}
                  placeholder="1400"
                  unit="kcal"
                  hint="Slight deficit — 1,350–1,450 kcal recommended for recomposition"
                />
                <NumericField
                  label="Daily protein target"
                  value={protein}
                  onChange={setProtein}
                  placeholder="95"
                  unit="g"
                  hint="Non-negotiable for muscle retention — aim 90–100g/day"
                />
                {(calories || protein) && (
                  <View style={s.nutritionNote}>
                    <Feather name="info" size={11} color="rgba(251,191,36,0.60)" />
                    <Text style={s.nutritionNoteText}>
                      Mention your meals and intake in your journal — Claude will track patterns automatically
                    </Text>
                  </View>
                )}
              </Section>

              {/* ── Body metrics ──────────────────────────────────── */}
              <Section icon="bar-chart-2" title="Body Composition" accent="rgba(196,181,253,0.90)">

                {/* Phase milestones */}
                <View>
                  <Text style={s.fieldLabel}>Body fat % milestones</Text>
                  <View style={s.phases}>
                    <PhaseBadge phase="Now" target={45.7} current={45.7} unit="%" />
                    <PhaseBadge phase="Phase 1 · Sep" target={42} unit="%" />
                    <PhaseBadge phase="Phase 2 · Dec 27" target={35} unit="%" />
                    <PhaseBadge phase="Phase 3" target={30} unit="%" />
                  </View>
                </View>

                <NumericField
                  label="Current phase target — body fat %"
                  value={bodyFatTarget}
                  onChange={setBodyFatTarget}
                  placeholder="42"
                  unit="%"
                  hint="Phase 1 target: ~42%. Phase 2: ~35%. Final: 28–33%."
                />

                <NumericField
                  label="Skeletal muscle target"
                  value={muscleTarget}
                  onChange={setMuscleTarget}
                  placeholder="17"
                  unit="kg"
                  hint="Currently 16.2 kg. Phase 1 target: 17 kg+"
                />

                {/* Waist tracking */}
                <View style={s.waistBlock}>
                  <Text style={s.fieldLabel}>Waist circumference — weekly log</Text>
                  <Text style={s.fieldHint}>Best proxy for visceral fat. Measure weekly, same time, same spot.</Text>

                  <View style={s.waistInputRow}>
                    <View style={[nf.row, { flex: 1 }]}>
                      <TextInput
                        style={nf.input}
                        value={waistNow}
                        onChangeText={setWaistNow}
                        placeholder="e.g. 87"
                        placeholderTextColor="rgba(152,212,250,0.28)"
                        keyboardType="numeric"
                        returnKeyType="done"
                      />
                      <Text style={nf.unit}>cm</Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleLogWaist}
                      style={[s.logBtn, { opacity: waistNow.length > 0 ? 1 : 0.4 }]}
                      disabled={waistNow.length === 0}
                    >
                      <Text style={s.logBtnText}>Log</Text>
                    </TouchableOpacity>
                  </View>

                  <NumericField
                    label="Waist goal"
                    value={waistTarget}
                    onChange={setWaistTarget}
                    placeholder="80"
                    unit="cm"
                  />

                  {/* History strip */}
                  {waistHistory.length > 0 && (
                    <View style={s.waistHistory}>
                      <Text style={s.fieldLabel}>History</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                          {waistHistory.slice(-8).map((e, i, arr) => {
                            const prev = arr[i - 1];
                            const delta = prev ? e.cm - prev.cm : 0;
                            const color = delta <= 0 ? 'rgba(110,231,183,0.85)' : 'rgba(252,165,165,0.85)';
                            return (
                              <View key={e.date} style={s.waistChip}>
                                <Text style={s.waistDate}>
                                  {new Date(e.date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </Text>
                                <Text style={s.waistVal}>{e.cm} cm</Text>
                                {prev && (
                                  <Text style={[s.waistDelta, { color }]}>
                                    {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                                  </Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </View>
              </Section>

              {/* ── Spending ──────────────────────────────────────── */}
              <Section icon="credit-card" title="Monthly Spending Budget" accent="rgba(74,222,128,0.90)">
                <NumericField
                  label="Total budget"
                  value={spendBudget}
                  onChange={setSpendBudget}
                  placeholder="15,000"
                  unit="₹"
                  hint="Tracked automatically from bank SMS on Android"
                />
              </Section>

            </ScrollView>

            {/* Save */}
            <View style={s.footer}>
              <TouchableOpacity
                style={[s.saveBtn, !anySet && s.saveBtnOff]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Feather name="check" size={16} color={anySet ? '#fff' : 'rgba(224,242,254,0.30)'} />
                <Text style={[s.saveBtnText, !anySet && { color: 'rgba(224,242,254,0.30)' }]}>
                  {saving ? 'Saving…' : 'Save Goals'}
                </Text>
              </TouchableOpacity>
            </View>

          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const s = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  title:    { fontSize: 22, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)' },
  subtitle: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', marginTop: 3 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(152,212,250,0.08)', borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)', alignItems: 'center', justifyContent: 'center' },

  scroll:      { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  fieldLabel:  { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldHint:   { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.38)', lineHeight: 15, marginTop: 2 },
  goalSummary: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', marginTop: 8 },
  hi:          { color: 'rgba(224,242,254,0.85)', fontWeight: '500' },

  phases: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },

  nutritionNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: 'rgba(251,191,36,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.14)', padding: 10 },
  nutritionNoteText: { flex: 1, fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(251,191,36,0.70)', lineHeight: 16 },

  waistBlock:    { gap: 10 },
  waistInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  logBtn:        { backgroundColor: 'rgba(9,41,173,0.50)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152,212,250,0.30)', paddingHorizontal: 14, paddingVertical: 11 },
  logBtnText:    { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.90)' },

  waistHistory: { gap: 6, marginTop: 4 },
  waistChip:    { backgroundColor: 'rgba(152,212,250,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(152,212,250,0.12)', paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', minWidth: 72 },
  waistDate:    { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)' },
  waistVal:     { fontSize: 14, fontFamily: 'Baskerville', color: 'rgba(224,242,254,0.90)', marginTop: 1 },
  waistDelta:   { fontSize: 10, fontFamily: 'GillSans-Light', marginTop: 1 },

  footer:      { paddingHorizontal: 20, paddingVertical: 16 },
  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0929AD', borderRadius: 16, paddingVertical: 15, borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)' },
  saveBtnOff:  { backgroundColor: 'rgba(9,41,173,0.20)', borderColor: 'rgba(152,212,250,0.10)' },
  saveBtnText: { fontSize: 15, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.95)', fontWeight: '500' },
});
