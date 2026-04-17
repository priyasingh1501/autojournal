/**
 * WellbeingResponseModal — calm, warm response surface for Tier 2 and Tier 3 distress.
 *
 * Tier 2 view: Soft check-in. Two choices — continue journaling, or open up.
 *              If they open up: a follow-up question about human connection.
 * Tier 3 view: Pause. Warm acknowledgment. Crisis resources. Door stays open.
 *
 * Emotional tone throughout: calm, steady, caring. Never alarmed.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { DistressTier } from '../services/WellbeingService';

// ── Crisis resources ───────────────────────────────────────────────────────────

interface Resource {
  name: string;
  detail: string;
  action: string;    // phone number or URL
  isPhone: boolean;
}

const CRISIS_RESOURCES: Resource[] = [
  {
    name: 'iCall',
    detail: 'Mon–Sat · 8 am – 10 pm',
    action: '9152987821',
    isPhone: true,
  },
  {
    name: 'Vandrevala Foundation',
    detail: '24 / 7 · Free & confidential',
    action: '18602662345',
    isPhone: true,
  },
  {
    name: 'Snehi',
    detail: 'Emotional support helpline',
    action: '04424640050',
    isPhone: true,
  },
  {
    name: 'IASP Crisis Centres',
    detail: 'Find support worldwide',
    action: 'https://www.iasp.info/resources/Crisis_Centres/',
    isPhone: false,
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  tier: DistressTier;
  onContinue: () => void;      // user wants to keep journaling
  onDismiss: () => void;       // user closes / acknowledges
  onFalsePositive?: () => void; // user says "I was just venting"
}

type T2View = 'initial' | 'opened-up';

function callOrOpen(resource: Resource) {
  if (resource.isPhone) {
    Linking.openURL(`tel:${resource.action}`).catch(() => {});
  } else {
    Linking.openURL(resource.action).catch(() => {});
  }
}

export default function WellbeingResponseModal({
  visible,
  tier,
  onContinue,
  onDismiss,
  onFalsePositive,
}: Props) {
  const [t2View, setT2View] = useState<T2View>('initial');

  const handleClose = () => {
    setT2View('initial');
    onDismiss();
  };

  const handleContinue = () => {
    setT2View('initial');
    onContinue();
  };

  // ── Tier 2 ─────────────────────────────────────────────────────────────────
  const renderTier2 = () => {
    if (t2View === 'initial') {
      return (
        <>
          {/* Icon */}
          <View style={s.iconWrap}>
            <Feather name="heart" size={28} color="rgba(152, 212, 250, 0.70)" />
          </View>

          {/* Message */}
          <Text style={s.heading}>A gentle check-in</Text>

          {/* Transparency note */}
          <Text style={s.transparencyNote}>
            untangle noticed some heavy language in your last entry. This isn't a clinical
            assessment — just a check-in. It gets it wrong sometimes.
          </Text>

          <Text style={s.body}>
            How are you doing, really?
          </Text>

          {/* Choices */}
          <TouchableOpacity style={s.primaryBtn} onPress={() => setT2View('opened-up')}>
            <Text style={s.primaryBtnText}>I'd like to talk about it</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBtn} onPress={handleContinue}>
            <Text style={s.secondaryBtnText}>Continue journaling</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.falsePositiveBtn}
            onPress={() => {
              onFalsePositive?.();
              handleContinue();
            }}
          >
            <Text style={s.falsePositiveText}>I was just venting — this doesn't apply</Text>
          </TouchableOpacity>
        </>
      );
    }

    // opened-up view
    return (
      <>
        <View style={s.iconWrap}>
          <Feather name="message-circle" size={28} color="rgba(152, 212, 250, 0.70)" />
        </View>

        <Text style={s.heading}>I hear you</Text>
        <Text style={s.body}>
          Whatever you're holding — it's real, and it matters. You don't have to
          figure it out alone.
        </Text>
        <Text style={[s.body, { marginTop: 14 }]}>
          Is there someone in your life you can talk to about this? A friend,
          a family member, or someone you trust?
        </Text>

        <View style={s.divider} />

        <Text style={s.resourceHint}>
          If you'd like professional support, these are always available:
        </Text>

        {CRISIS_RESOURCES.slice(0, 2).map(r => (
          <ResourceRow key={r.name} resource={r} />
        ))}

        <TouchableOpacity style={s.primaryBtn} onPress={handleContinue}>
          <Text style={s.primaryBtnText}>Continue journaling</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={handleClose}>
          <Text style={s.secondaryBtnText}>Close</Text>
        </TouchableOpacity>
      </>
    );
  };

  // ── Tier 3 ─────────────────────────────────────────────────────────────────
  const renderTier3 = () => (
    <>
      {/* Icon */}
      <View style={[s.iconWrap, s.iconWrapCrisis]}>
        <Feather name="heart" size={28} color="rgba(230, 57, 70, 0.80)" />
      </View>

      {/* Message */}
      <Text style={s.heading}>I hear you</Text>
      <Text style={s.body}>
        What you're sharing sounds really serious, and I want you to know I hear you.
        You don't have to go through this alone — please reach out to someone who can
        actually be there with you.
      </Text>

      {/* Resources */}
      <View style={s.resourcesCard}>
        <Text style={s.resourcesTitle}>Reach out — right now</Text>
        <Text style={s.humanStaffedNote}>
          These lines are staffed by trained humans, not AI.
        </Text>
        {CRISIS_RESOURCES.map(r => (
          <ResourceRow key={r.name} resource={r} crisis />
        ))}
      </View>

      {/* Door stays open */}
      <Text style={s.closingNote}>
        Whenever you're ready to come back, I'll be here.
      </Text>

      <TouchableOpacity style={s.secondaryBtn} onPress={handleClose}>
        <Text style={s.secondaryBtnText}>Close</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <SafeAreaView style={s.safe} edges={['bottom', 'top']}>
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.card}>
              {tier === 2 ? renderTier2() : renderTier3()}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Resource row ───────────────────────────────────────────────────────────────

function ResourceRow({ resource, crisis }: { resource: Resource; crisis?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.resourceRow, crisis && s.resourceRowCrisis]}
      onPress={() => callOrOpen(resource)}
      activeOpacity={0.75}
    >
      <View style={s.resourceInfo}>
        <Text style={s.resourceName}>{resource.name}</Text>
        <Text style={s.resourceDetail}>{resource.detail}</Text>
      </View>
      <View style={[s.resourceAction, crisis && s.resourceActionCrisis]}>
        <Feather
          name={resource.isPhone ? 'phone' : 'external-link'}
          size={14}
          color={crisis ? 'rgba(230, 57, 70, 0.85)' : 'rgba(152, 212, 250, 0.75)'}
        />
        <Text style={[s.resourceActionText, crisis && s.resourceActionTextCrisis]}>
          {resource.isPhone ? 'Call' : 'Visit'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 14, 0.88)',
    justifyContent: 'center',
    padding: 20,
  },
  safe: { flex: 1, justifyContent: 'center' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },

  card: {
    backgroundColor: 'rgba(3, 18, 40, 0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.16)',
    padding: 28,
    shadowColor: '#98D4FA',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 12,
  },

  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(152, 212, 250, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    alignSelf: 'center',
  },
  iconWrapCrisis: {
    backgroundColor: 'rgba(230, 57, 70, 0.07)',
    borderColor: 'rgba(230, 57, 70, 0.20)',
  },

  heading: {
    fontSize: 22,
    fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.95)',
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    fontSize: 15,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.80)',
    textAlign: 'center',
    lineHeight: 23,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(152, 212, 250, 0.10)',
    marginVertical: 20,
  },

  resourceHint: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.55)',
    textAlign: 'center',
    marginBottom: 12,
  },

  // ── Resources card (Tier 3) ────────────────────────────────────────────────
  resourcesCard: {
    backgroundColor: 'rgba(230, 57, 70, 0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230, 57, 70, 0.15)',
    padding: 16,
    marginTop: 20,
    marginBottom: 4,
  },
  resourcesTitle: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(230, 57, 70, 0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    textAlign: 'center',
  },

  // ── Resource rows ──────────────────────────────────────────────────────────
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(9, 41, 173, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.12)',
    marginTop: 8,
  },
  resourceRowCrisis: {
    backgroundColor: 'rgba(230, 57, 70, 0.07)',
    borderColor: 'rgba(230, 57, 70, 0.15)',
    marginTop: 8,
  },
  resourceInfo: { flex: 1 },
  resourceName: {
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.90)',
    fontWeight: '500',
  },
  resourceDetail: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.55)',
    marginTop: 2,
  },
  resourceAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(9, 41, 173, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.20)',
  },
  resourceActionCrisis: {
    backgroundColor: 'rgba(230, 57, 70, 0.10)',
    borderColor: 'rgba(230, 57, 70, 0.25)',
  },
  resourceActionText: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.80)',
    fontWeight: '500',
  },
  resourceActionTextCrisis: {
    color: 'rgba(230, 57, 70, 0.90)',
  },

  transparencyNote: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.45)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    fontStyle: 'italic',
  },
  humanStaffedNote: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.50)',
    textAlign: 'center',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  falsePositiveBtn: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(152, 212, 250, 0.07)',
  },
  falsePositiveText: {
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.30)',
  },

  closingNote: {
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.55)',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 4,
    fontStyle: 'italic',
  },

  // ── Buttons ────────────────────────────────────────────────────────────────
  primaryBtn: {
    marginTop: 22,
    backgroundColor: 'rgba(9, 41, 173, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(152, 212, 250, 0.30)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.92)',
    fontWeight: '500',
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.55)',
  },
});
