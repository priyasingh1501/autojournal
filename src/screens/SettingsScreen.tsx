import React, { useState, useCallback } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StorageService } from '../services/StorageService';
import { clearImageCache } from '../services/WisdomImageService';
import PinSetupModal from '../components/PinSetupModal';
import LegalDocModal, { LegalDoc } from '../components/LegalDocModal';
import { SubscriptionService } from '../services/SubscriptionService';
import PaywallModal from '../components/PaywallModal';
import {
  isWellbeingEnabled,
  setWellbeingEnabled as saveWellbeingEnabled,
} from '../services/WellbeingService';
import {
  requestNotificationPermission,
  cancelSmartNotifications,
  scheduleSmartNotifications,
} from '../services/SmartNotificationService';
import { AppSettings } from '../types';
import { getCurrentUser, signOut } from '../services/AuthService';
import { track } from '../services/AnalyticsService';

const DEFAULT_SETTINGS: AppSettings = {
  summaryTime: '21:00',
  batchSize: 0,
  notificationsEnabled: true,
  notificationTime: '19:30',
};

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // PIN / App Lock
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  // Drives which flow the PIN modal runs:
  //   'create' — first-time setup (no current PIN to verify)
  //   'change' — replacing an existing PIN (verify current, then create new)
  //   'disable' — verify current PIN, then remove it (no new PIN entry)
  const [pinIntent, setPinIntent] = useState<'create' | 'change' | 'disable'>('create');

  // Legal docs
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  // Subscription
  const [isPro, setIsPro]           = useState(false);
  const [isTrialing, setIsTrialing] = useState(false);
  const [trialDays, setTrialDays]   = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);

  // Wellbeing check-ins
  const [wellbeingEnabled, setWellbeingEnabled] = useState(true);

  // Smart notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationTime, setNotificationTime] = useState('19:30');

  // Account
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadSettings();
    StorageService.hasPinSet().then(setPinEnabled);
    isWellbeingEnabled().then(setWellbeingEnabled);
    SubscriptionService.hasPro().then(setIsPro);
    SubscriptionService.isInTrial().then(setIsTrialing);
    SubscriptionService.getTrialDaysRemaining().then(setTrialDays);
    getCurrentUser().then(u => setUserEmail(u?.email ?? null));
  }, []));

  const loadSettings = async () => {
    const s = await StorageService.getSettings();
    if (s) {
      setSettings(s);
      setNotificationsEnabled(s.notificationsEnabled ?? true);
      setNotificationTime(s.notificationTime ?? '19:30');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Subscription */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan</Text>
          {isPro && !isTrialing ? (
            <View style={styles.subRow}>
              <View style={styles.proBadge}>
                <Feather name="zap" size={12} color="rgba(224,242,254,0.90)" />
                <Text style={styles.proBadgeText}>Pro</Text>
              </View>
              <Text style={styles.subStatus}>You have full access to all features.</Text>
            </View>
          ) : isTrialing ? (
            <View style={styles.subRow}>
              <View style={[styles.proBadge, styles.trialBadge]}>
                <Text style={styles.proBadgeText}>Trial</Text>
              </View>
              <Text style={styles.subStatus}>
                {trialDays} day{trialDays !== 1 ? 's' : ''} left — free access to everything.
              </Text>
            </View>
          ) : (
            <View style={styles.subRow}>
              <Text style={styles.subStatus}>Free plan · 3 summaries/week</Text>
            </View>
          )}
          {!isPro || isTrialing ? (
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => setShowPaywall(true)} activeOpacity={0.85}>
              <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => Linking.openURL(
                Platform.OS === 'android'
                  ? 'https://play.google.com/store/account/subscriptions'
                  : 'https://apps.apple.com/account/subscriptions'
              )}
              activeOpacity={0.8}
            >
              <Text style={styles.manageBtnText}>Manage subscription</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* App Lock */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Lock</Text>
          <Text style={styles.sectionSubtitle}>
            Require a 4-digit PIN each time you open the app or return from background.
          </Text>

          <View style={styles.lockRow}>
            <View style={styles.lockRowLeft}>
              <Feather name="lock" size={16} color="rgba(152, 212, 250, 0.75)" />
              <Text style={styles.lockRowLabel}>Require PIN to open</Text>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={async (val) => {
                if (val) {
                  // Enable — open setup modal in create mode
                  setPinIntent('create');
                  setShowPinSetup(true);
                } else {
                  // Disable — verify current PIN first, then remove
                  setPinIntent('disable');
                  setShowPinSetup(true);
                }
              }}
              trackColor={{ false: 'rgba(152, 212, 250, 0.12)', true: 'rgba(9, 41, 173, 0.60)' }}
              thumbColor={pinEnabled ? 'rgba(152, 212, 250, 0.90)' : 'rgba(152, 212, 250, 0.45)'}
            />
          </View>

          {pinEnabled && (
            <TouchableOpacity
              style={styles.changePinBtn}
              onPress={() => {
                setPinIntent('change');
                setShowPinSetup(true);
              }}
            >
              <Feather name="refresh-cw" size={13} color="rgba(152, 212, 250, 0.75)" />
              <Text style={styles.changePinText}>Change PIN</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PIN setup modal — drives create / change / disable based on intent */}
        <PinSetupModal
          visible={showPinSetup}
          requireCurrent={pinIntent === 'change'}
          verifyOnly={pinIntent === 'disable'}
          verifyTitle={pinIntent === 'disable' ? 'Enter your PIN to disable App Lock' : undefined}
          verifySubtitle={pinIntent === 'disable' ? 'This will remove the PIN protection.' : undefined}
          onDone={async () => {
            setShowPinSetup(false);
            if (pinIntent === 'disable') {
              await StorageService.removePin();
              setPinEnabled(false);
            } else {
              // create or change — PIN now exists
              setPinEnabled(true);
            }
          }}
          onCancel={() => setShowPinSetup(false)}
        />

        {/* Wellbeing check-ins */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wellbeing check-ins</Text>
          <Text style={styles.sectionSubtitle}>
            Flags entries that might warrant a check-in. Runs on-device — nothing is shared.
          </Text>

          <View style={styles.lockRow}>
            <View style={styles.lockRowLeft}>
              <Feather name="shield" size={16} color="rgba(152, 212, 250, 0.75)" />
              <Text style={styles.lockRowLabel}>Wellbeing check-ins</Text>
            </View>
            <Switch
              value={wellbeingEnabled}
              onValueChange={async (val) => {
                await saveWellbeingEnabled(val);
                setWellbeingEnabled(val);
              }}
              trackColor={{ false: 'rgba(152, 212, 250, 0.12)', true: 'rgba(9, 41, 173, 0.60)' }}
              thumbColor={wellbeingEnabled ? 'rgba(152, 212, 250, 0.90)' : 'rgba(152, 212, 250, 0.45)'}
            />
          </View>

          <Text style={styles.hint}>
            Not a clinical tool — does not replace professional support.
          </Text>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.sectionSubtitle}>
            One nudge per day, timed to your entries and mood.
          </Text>

          <View style={styles.lockRow}>
            <View style={styles.lockRowLeft}>
              <Feather name="bell" size={16} color="rgba(152, 212, 250, 0.75)" />
              <Text style={styles.lockRowLabel}>Daily reflection reminder</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={async (val) => {
                if (val) {
                  const granted = await requestNotificationPermission();
                  if (!granted) {
                    Alert.alert(
                      'Permission Required',
                      'Please allow notifications in your device settings to enable this.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => Linking.openSettings() },
                      ],
                    );
                    return;
                  }
                  setNotificationsEnabled(true);
                  const updated = { ...settings, notificationsEnabled: true, notificationTime };
                  await StorageService.saveSettings(updated);
                  scheduleSmartNotifications(notificationTime).catch(() => {});
                } else {
                  setNotificationsEnabled(false);
                  const updated = { ...settings, notificationsEnabled: false, notificationTime };
                  await StorageService.saveSettings(updated);
                  cancelSmartNotifications().catch(() => {});
                }
              }}
              trackColor={{ false: 'rgba(152, 212, 250, 0.12)', true: 'rgba(9, 41, 173, 0.60)' }}
              thumbColor={notificationsEnabled ? 'rgba(152, 212, 250, 0.90)' : 'rgba(152, 212, 250, 0.45)'}
            />
          </View>

          {notificationsEnabled && (
            <>
              <Text style={[styles.label, { marginTop: 18 }]}>Remind me at</Text>
              <View style={styles.thresholdButtons}>
                {[
                  { label: '6:00 pm', value: '18:00' },
                  { label: '7:00 pm', value: '19:00' },
                  { label: '7:30 pm', value: '19:30' },
                  { label: '9:00 pm', value: '21:00' },
                ].map(({ label, value }) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.thresholdButton,
                      notificationTime === value && styles.thresholdButtonSelected,
                    ]}
                    onPress={async () => {
                      setNotificationTime(value);
                      const updated = { ...settings, notificationsEnabled: true, notificationTime: value };
                      await StorageService.saveSettings(updated);
                      await cancelSmartNotifications().catch(() => {});
                      scheduleSmartNotifications(value).catch(() => {});
                    }}
                  >
                    <Text style={[
                      styles.thresholdButtonText,
                      notificationTime === value && styles.thresholdButtonTextSelected,
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

        </View>

        {/* Storage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>
          <Text style={styles.sectionSubtitle}>
            Wisdom images are cached on-device and auto-expire after 30 days.
          </Text>
          <TouchableOpacity
            style={styles.clearCacheBtn}
            onPress={() => {
              Alert.alert(
                'Clear Image Cache',
                'This will delete all locally cached Wisdom Short images. They will be re-generated when you next view each short.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                      await clearImageCache();
                      Alert.alert('Done', 'Image cache cleared.');
                    },
                  },
                ],
              );
            }}
          >
            <Feather name="trash-2" size={14} color="rgba(252,165,165,0.80)" />
            <Text style={styles.clearCacheText}>Clear wisdom image cache</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearCacheBtn}
            onPress={() => {
              Alert.alert(
                'Clear stuck recordings',
                'If the mic is stuck on "thinking…", this removes any pending audio clips that the transcriber kept failing on. Saved entries are not affected.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                      await StorageService.clearPendingClips();
                      Alert.alert('Done', 'Pending recordings cleared.');
                    },
                  },
                ],
              );
            }}
          >
            <Feather name="mic-off" size={14} color="rgba(252,165,165,0.80)" />
            <Text style={styles.clearCacheText}>Clear stuck recordings</Text>
          </TouchableOpacity>
        </View>

        {/* Backup — Android only */}
        {Platform.OS === 'android' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Backup</Text>
            <Text style={styles.sectionSubtitle}>
              Backed up to your Google account. Restores automatically when you reinstall.
            </Text>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={async () => {
                try {
                  await Linking.sendIntent('android.settings.PRIVACY_SETTINGS');
                } catch {
                  try { await Linking.openSettings(); } catch {}
                }
              }}
            >
              <Feather name="cloud" size={14} color="rgba(152,212,250,0.85)" />
              <Text style={styles.uploadText}>Open Android backup settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {userEmail ? (
            <Text style={styles.accountEmail}>{userEmail}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.signOutBtn}
            activeOpacity={0.85}
            onPress={() => {
              Alert.alert(
                'Sign out',
                'You will need to sign in again to use the app.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign out',
                    style: 'destructive',
                    onPress: async () => {
                      track('user_signed_out');
                      await signOut();
                    },
                  },
                ],
              );
            }}
          >
            <Feather name="log-out" size={14} color="rgba(252,165,165,0.80)" />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => setLegalDoc('privacy')}
          >
            <Feather name="shield" size={15} color="rgba(152, 212, 250, 0.65)" />
            <Text style={styles.legalLink}>Privacy Policy</Text>
            <Feather name="chevron-right" size={16} color="rgba(152, 212, 250, 0.40)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => setLegalDoc('terms')}
          >
            <Feather name="file-text" size={15} color="rgba(152, 212, 250, 0.65)" />
            <Text style={styles.legalLink}>Terms of Service</Text>
            <Feather name="chevron-right" size={16} color="rgba(152, 212, 250, 0.40)" />
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>untangle v1.4.0</Text>
        </View>
      </ScrollView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          setIsPro(true);
          setIsTrialing(false);
        }}
      />

      <LegalDocModal
        visible={legalDoc !== null}
        doc={legalDoc ?? 'privacy'}
        onClose={() => setLegalDoc(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02060E' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  // ── Section cards ─────────────────────────────────────────────────────────
  // Cards match the visual language of TodayCard / IntentionsCard /
  // SecondaryActions on the rest of the app: near-black background, subtle
  // blue-grey border, rounded 20.
  section: {
    backgroundColor: 'rgba(2, 6, 14, 0.90)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.16)',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    marginBottom: 6,
    fontFamily: 'Baskerville',
  },
  subRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  subStatus:      { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.60)', flex: 1 },
  proBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(9,41,173,0.60)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(152,212,250,0.30)' },
  trialBadge:     { backgroundColor: 'rgba(9,41,173,0.30)' },
  proBadgeText:   { fontSize: 11, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.90)', letterSpacing: 0.5 },
  upgradeBtn:     { backgroundColor: 'rgba(9,41,173,0.70)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(152,212,250,0.35)', paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  upgradeBtnText: { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(224,242,254,0.95)' },
  manageBtn:      { paddingVertical: 8, alignItems: 'flex-start', marginTop: 2 },
  manageBtnText:  { fontSize: 13, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.50)', textDecorationLine: 'underline' },
  sectionSubtitle: {
    fontSize: 13,
    color: 'rgba(152, 212, 250, 0.65)',
    marginBottom: 16,
    fontFamily: 'GillSans-Light',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(224, 242, 254, 0.95)',
    marginTop: 14,
    marginBottom: 6,
    fontFamily: 'GillSans-Light',
  },
  hint: { fontSize: 12, color: 'rgba(152, 212, 250, 0.60)', marginBottom: 10, fontFamily: 'GillSans-Light' },

  // ── Threshold buttons ──────────────────────────────────────────────────────
  thresholdButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  thresholdButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(9, 41, 173, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    alignItems: 'center',
  },
  thresholdButtonSelected: {
    backgroundColor: 'rgba(9, 41, 173, 0.22)',
    borderColor: 'rgba(152, 212, 250, 0.50)',
  },
  thresholdButtonText: { color: 'rgba(152, 212, 250, 0.85)', fontSize: 13, fontWeight: '500', fontFamily: 'GillSans-Light' },
  thresholdButtonTextSelected: { color: 'rgba(224, 242, 254, 0.95)', fontWeight: '500' },

  accountEmail: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152,212,250,0.55)',
    marginBottom: 14,
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.25)',
    backgroundColor: 'rgba(252,165,165,0.05)',
    alignSelf: 'flex-start',
  },
  signOutText: { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(252,165,165,0.80)' },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.25)',
    backgroundColor: 'rgba(9,41,173,0.10)',
  },
  uploadText: { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(152,212,250,0.85)' },

  clearCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.25)',
    backgroundColor: 'rgba(252,165,165,0.05)',
  },
  clearCacheText: { fontSize: 14, fontFamily: 'GillSans-Light', color: 'rgba(252,165,165,0.80)' },

  // ── App Lock ───────────────────────────────────────────────────────────────
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 4,
  },
  lockRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockRowLabel: {
    fontSize: 15,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.90)',
  },
  changePinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(9, 41, 173, 0.10)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.18)',
    alignSelf: 'flex-start',
  },
  changePinText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.80)',
  },

  // ── Legal ──────────────────────────────────────────────────────────────────
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  legalLink: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.80)',
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: { alignItems: 'center', marginTop: 24, marginBottom: 12 },
  footerText: { color: 'rgba(152, 212, 250, 0.60)', fontSize: 13, textAlign: 'center', fontFamily: 'GillSans-Light' },
});
