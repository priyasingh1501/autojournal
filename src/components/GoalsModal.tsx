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

// ── Day picker (1–7 circles) ──────────────────────────────────────────────────

function DayPicker({
  value,
  onChange,
  max = 7,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <View style={dp.row}>
      {Array.from({ length: max }, (_, i) => i + 1).map(d => {
        const active = d <= value;
        return (
          <TouchableOpacity
            key={d}
            onPress={() => onChange(value === d ? 0 : d)}
            style={[dp.circle, active ? dp.circleOn : dp.circleOff]}
            activeOpacity={0.7}
          >
            <Text style={[dp.label, active ? dp.labelOn : dp.labelOff]}>{d}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const dp = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 8, marginTop: 10 },
  circle:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  circleOn:  { backgroundColor: 'rgba(9,41,173,0.50)', borderColor: 'rgba(152,212,250,0.60)' },
  circleOff: { backgroundColor: 'rgba(152,212,250,0.05)', borderColor: 'rgba(152,212,250,0.18)' },
  label:     { fontSize: 13, fontFamily: 'GillSans-Light' },
  labelOn:   { color: 'rgba(224,242,254,0.95)' },
  labelOff:  { color: 'rgba(152,212,250,0.40)' },
});

// ── Section block ─────────────────────────────────────────────────────────────

function GoalSection({
  icon,
  title,
  color,
  children,
}: {
  icon: string;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View style={gs.card}>
      <View style={gs.header}>
        <View style={[gs.iconWrap, { backgroundColor: color.replace('0.90)', '0.10)') }]}>
          <Feather name={icon as any} size={14} color={color} />
        </View>
        <Text style={gs.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const gs = StyleSheet.create({
  card:    { backgroundColor: 'rgba(152,212,250,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(152,212,250,0.09)', padding: 16, gap: 4 },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconWrap:{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 13, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)' },
});

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (goals: UserGoals) => void;
}

export default function GoalsModal({ visible, onClose, onSaved }: Props) {
  const [spendBudget,        setSpendBudget]        = useState('');
  const [workoutDays,        setWorkoutDays]        = useState(0);
  const [healthyMealDays,    setHealthyMealDays]    = useState(0);
  const [saving,             setSaving]             = useState(false);

  useEffect(() => {
    if (visible) loadGoals();
  }, [visible]);

  const loadGoals = async () => {
    const goals = await StorageService.getGoals();
    if (!goals) return;
    if (goals.monthlySpendBudget)      setSpendBudget(String(goals.monthlySpendBudget));
    if (goals.workoutDaysPerWeek)      setWorkoutDays(goals.workoutDaysPerWeek);
    if (goals.healthyMealDaysPerWeek)  setHealthyMealDays(goals.healthyMealDaysPerWeek);
  };

  const handleSave = async () => {
    setSaving(true);
    const goals: UserGoals = {};
    const budget = parseFloat(spendBudget.replace(/,/g, ''));
    if (!isNaN(budget) && budget > 0) goals.monthlySpendBudget = budget;
    if (workoutDays > 0)    goals.workoutDaysPerWeek     = workoutDays;
    if (healthyMealDays > 0) goals.healthyMealDaysPerWeek = healthyMealDays;
    await StorageService.saveGoals(goals);
    setSaving(false);
    onSaved(goals);
    onClose();
  };

  const anySet = spendBudget.trim().length > 0 || workoutDays > 0 || healthyMealDays > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={['#02060E', '#041628', '#02060E']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Monthly Goals</Text>
                <Text style={styles.subtitle}>Set targets — we'll show your progress</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={18} color="rgba(152,212,250,0.70)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* ── Spending ── */}
              <GoalSection icon="credit-card" title="Spending Budget" color="rgba(74,222,128,0.90)">
                <Text style={styles.fieldLabel}>Total monthly budget (₹)</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.rupeeSign}>₹</Text>
                  <TextInput
                    style={styles.input}
                    value={spendBudget}
                    onChangeText={setSpendBudget}
                    placeholder="e.g.  15,000"
                    placeholderTextColor="rgba(152,212,250,0.30)"
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                  {spendBudget.length > 0 && (
                    <TouchableOpacity onPress={() => setSpendBudget('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="x-circle" size={14} color="rgba(152,212,250,0.40)" />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.hint}>
                  We'll track your total spend from bank SMS against this amount
                </Text>
              </GoalSection>

              {/* ── Workout ── */}
              <GoalSection icon="activity" title="Workout" color="rgba(110,231,183,0.90)">
                <Text style={styles.fieldLabel}>Days per week</Text>
                <DayPicker value={workoutDays} onChange={setWorkoutDays} />
                {workoutDays > 0 && (
                  <Text style={styles.goalSummary}>
                    Target: <Text style={styles.goalHighlight}>{workoutDays} day{workoutDays !== 1 ? 's' : ''} / week</Text>
                    {' '}·{' '}
                    <Text style={styles.goalHighlight}>{workoutDays * 4} days</Text> this month
                  </Text>
                )}
              </GoalSection>

              {/* ── Meals ── */}
              <GoalSection icon="coffee" title="Healthy Eating" color="rgba(251,191,36,0.90)">
                <Text style={styles.fieldLabel}>Healthy days per week</Text>
                <DayPicker value={healthyMealDays} onChange={setHealthyMealDays} />
                {healthyMealDays > 0 && (
                  <Text style={styles.goalSummary}>
                    Target: <Text style={styles.goalHighlight}>{healthyMealDays} day{healthyMealDays !== 1 ? 's' : ''} / week</Text>
                    {' '}eating well
                  </Text>
                )}
              </GoalSection>

            </ScrollView>

            {/* Save */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, !anySet && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving || !anySet}
                activeOpacity={0.85}
              >
                <Feather name="check" size={16} color={anySet ? '#fff' : 'rgba(224,242,254,0.30)'} />
                <Text style={[styles.saveBtnText, !anySet && styles.saveBtnTextDisabled]}>
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
  },
  title:    { fontSize: 22, fontFamily: 'Baskerville', fontWeight: '500', color: 'rgba(224,242,254,0.95)' },
  subtitle: { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.55)', marginTop: 3 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(152,212,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },

  fieldLabel: { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', letterSpacing: 0.4, marginTop: 4 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(152,212,250,0.06)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.18)',
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
  },
  rupeeSign: { fontSize: 16, color: 'rgba(152,212,250,0.60)', fontFamily: 'GillSans-Light' },
  input: {
    flex: 1, fontSize: 18, fontFamily: 'Baskerville',
    color: 'rgba(224,242,254,0.95)', padding: 0,
  },
  hint: { fontSize: 10, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.40)', marginTop: 6, lineHeight: 14 },

  goalSummary:   { fontSize: 12, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', marginTop: 10 },
  goalHighlight: { color: 'rgba(224,242,254,0.85)', fontWeight: '500' },

  footer: { paddingHorizontal: 20, paddingVertical: 16 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0929AD', borderRadius: 16, paddingVertical: 15,
    borderWidth: 1, borderColor: 'rgba(152,212,250,0.25)',
  },
  saveBtnDisabled: { backgroundColor: 'rgba(9,41,173,0.20)', borderColor: 'rgba(152,212,250,0.10)' },
  saveBtnText:        { fontSize: 15, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.95)', fontWeight: '500' },
  saveBtnTextDisabled:{ color: 'rgba(224,242,254,0.30)' },
});
