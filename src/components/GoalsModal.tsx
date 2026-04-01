import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorageService } from '../services/StorageService';
import { UserGoals } from '../types';

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
  const [carbs,           setCarbs]           = useState('');
  const [fat,             setFat]             = useState('');
  // Spending
  const [spendBudget,     setSpendBudget]     = useState('');
  const [saving,          setSaving]          = useState(false);

  useEffect(() => { if (visible) load(); }, [visible]);

  // Auto-populate carbs & fat from suggestion whenever calorie/protein inputs change
  useEffect(() => {
    if (!suggestedMacros) return;
    // Only overwrite if the user hasn't manually edited these fields
    setCarbs(v => v === '' || v === String(suggestedMacros!.carbsGrams) ? String(suggestedMacros!.carbsGrams) : v);
    setFat(v  => v === '' || v === String(suggestedMacros!.fatGrams)   ? String(suggestedMacros!.fatGrams)   : v);
  }, [calories, protein]);

  const load = async () => {
    const g = await StorageService.getGoals();
    if (!g) return;
    if (g.strengthDaysPerWeek)   setStrengthDays(g.strengthDaysPerWeek);
    if (g.cardioDaysPerWeek)     setCardioDays(g.cardioDaysPerWeek);
    // legacy migration
    if (!g.strengthDaysPerWeek && g.workoutDaysPerWeek) setStrengthDays(g.workoutDaysPerWeek);
    if (g.dailyCalorieTarget)    setCalories(String(g.dailyCalorieTarget));
    if (g.dailyProteinTarget)    setProtein(String(g.dailyProteinTarget));
    if (g.dailyCarbsTarget)      setCarbs(String(g.dailyCarbsTarget));
    if (g.dailyFatTarget)        setFat(String(g.dailyFatTarget));
    if (g.monthlySpendBudget)    setSpendBudget(String(g.monthlySpendBudget));
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
    const crb = parseFloat(carbs);
    if (!isNaN(crb) && crb > 0)                  g.dailyCarbsTarget     = crb;
    const ft = parseFloat(fat);
    if (!isNaN(ft) && ft > 0)                    g.dailyFatTarget       = ft;
    const bud = parseFloat(spendBudget.replace(/,/g, ''));
    if (!isNaN(bud) && bud > 0)                  g.monthlySpendBudget   = bud;
    await StorageService.saveGoals(g);
    setSaving(false);
    onSaved(g);
    onClose();
  };

  const anySet = strengthDays > 0 || cardioDays > 0 || !!calories || !!protein || !!spendBudget;

  // ── Macro suggestion ──────────────────────────────────────────────────────
  const suggestedMacros = (() => {
    const cal  = parseFloat(calories);
    const prot = parseFloat(protein);
    if (isNaN(cal) || cal <= 0 || isNaN(prot) || prot <= 0) return null;

    const protKcal = prot * 4;
    if (protKcal >= cal) return null;

    const fatKcal  = Math.round(cal * 0.28);
    const fatGrams = Math.round(fatKcal / 9);
    const carbsKcal  = Math.max(0, cal - protKcal - fatKcal);
    const carbsGrams = Math.round(carbsKcal / 4);

    return {
      carbsGrams,
      fatGrams,
      protPct:  Math.round((protKcal / cal) * 100),
      fatPct:   Math.round((fatKcal  / cal) * 100),
      carbsPct: Math.round((carbsKcal / cal) * 100),
    };
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

            {/* Header */}
            <View style={s.header}>
              <View>
                <Text style={s.title}>My Goals</Text>
                <Text style={s.subtitle}>Personalised to my recomposition plan</Text>
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
                <NumericField
                  label="Daily carbs target"
                  value={carbs}
                  onChange={setCarbs}
                  placeholder={suggestedMacros ? String(suggestedMacros.carbsGrams) : '150'}
                  unit="g"
                />
                <NumericField
                  label="Daily fat target"
                  value={fat}
                  onChange={setFat}
                  placeholder={suggestedMacros ? String(suggestedMacros.fatGrams) : '45'}
                  unit="g"
                />

                {(calories || protein) && (
                  <View style={s.nutritionNote}>
                    <Feather name="info" size={11} color="rgba(251,191,36,0.60)" />
                    <Text style={s.nutritionNoteText}>
                      Mention meals and intake in journal entries — Claude will track patterns automatically
                    </Text>
                  </View>
                )}
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

  nutritionNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: 'rgba(251,191,36,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.14)', padding: 10 },
  nutritionNoteText: { flex: 1, fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(251,191,36,0.70)', lineHeight: 16 },


  footer:      { paddingHorizontal: 20, paddingVertical: 16 },
  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0929AD', borderRadius: 16, paddingVertical: 15, borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)' },
  saveBtnOff:  { backgroundColor: 'rgba(9,41,173,0.20)', borderColor: 'rgba(152,212,250,0.10)' },
  saveBtnText: { fontSize: 15, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.95)', fontWeight: '500' },
});
