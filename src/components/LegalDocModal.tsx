/**
 * LegalDocModal — full-screen modal that displays the bundled privacy
 * policy or terms-of-service text. Static text lives next to this
 * component (PRIVACY_POLICY / TERMS_OF_SERVICE) so the modal works
 * offline and there is no broken external link to maintain.
 *
 * The wording is a baseline draft based on what the app actually does
 * (local-first storage, OpenAI Whisper transcription, Anthropic Claude
 * analysis, Supabase image cache, RevenueCat subscriptions, PostHog
 * analytics). Refine before public release if needed.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

export type LegalDoc = 'privacy' | 'terms';

interface Props {
  visible: boolean;
  doc: LegalDoc;
  onClose: () => void;
}

const LAST_UPDATED = 'April 2026';

const PRIVACY_POLICY = `
untangle is built around a simple idea: your journal is yours, and the
fewer parties that touch it, the better.

WHAT STAYS ON YOUR DEVICE
• Voice clips, transcripts, daily summaries, intentions, settings, and
  saved chats live in your phone's local storage (AsyncStorage).
• On Android, this data is automatically backed up to your own Google
  account through Android Auto Backup, and restored when you reinstall.
  We never see this backup — it lives in your Google Drive's hidden
  app-data area.

WHAT GETS SENT OFF-DEVICE (only when you use those features)
• Voice → text: audio clips are sent to OpenAI Whisper for transcription.
  OpenAI processes them and returns text. We do not store the audio
  server-side.
• Reflections, summaries, wisdom shorts: the transcript text is sent to
  Anthropic Claude to generate the daily summary, mind/perspective
  responses, and short pieces. Claude processes the text and returns the
  result. We do not store the conversation server-side.
• Wisdom-short images: when a short is shown for the first time, an
  image is generated and cached in our Supabase storage so other users
  can re-use it instead of re-generating. The image is associated with
  the short ID, not your identity.
• Account: signing in stores your email + an authentication token with
  Supabase Auth so you can use the app on a new device.
• Subscriptions: RevenueCat handles billing and entitlements.
• Anonymous usage analytics: we use PostHog to count anonymous events
  (e.g. "recording_started") to understand which features are used. No
  journal content is sent to analytics.

WHAT WE DO NOT DO
• We do not sell your data.
• We do not show ads.
• We do not share your journal entries with third parties.
• We do not have employees who read your entries.

YOUR CONTROLS
• Sign out at any time from Settings → Account.
• Clear locally cached wisdom images from Settings → Storage.
• Disable analytics by uninstalling the app (we'll add an in-app toggle
  if there's demand).
• Delete your account by emailing us — see CONTACT below.

CHILDREN
untangle is not directed at children under 13 and we do not knowingly
collect data from them.

CHANGES
We will update this policy as the app evolves. The date at the top of
this document reflects the last update.

CONTACT
For questions or data requests, write to the email listed on the App
Store / Play Store listing.
`.trim();

const TERMS_OF_SERVICE = `
Welcome to untangle. By using the app you agree to the following terms.

THE APP
untangle is a personal journaling tool. It is not a medical device, a
therapist, or a substitute for professional mental-health care. The
wellbeing check-ins and AI-generated reflections are for self-reflection
only — they are not clinical assessments and may be wrong.

YOUR ACCOUNT
You are responsible for keeping your sign-in credentials safe and for
the activity that happens under your account. The 4-digit App Lock PIN
is stored locally on your device and we cannot recover it for you.

ACCEPTABLE USE
Don't try to break the app, abuse the AI features, or use the app for
anything illegal. We may suspend accounts that do.

SUBSCRIPTIONS
Pro subscriptions are billed through Apple or Google. Cancellations
follow the rules of your app store. Refunds are handled by the store.

DISCLAIMER & LIMITATION OF LIABILITY
The app is provided "as is", without warranty of any kind. We are not
liable for any indirect or consequential damages arising from your use
of the app, including but not limited to data loss, missed
notifications, or AI-generated content that turns out to be incorrect.
You are responsible for backing up anything you don't want to lose —
Android Auto Backup helps, but is not guaranteed.

CHANGES
We may update these terms as the app evolves. Continued use of the app
after a change means you accept the updated terms.

GOVERNING LAW
These terms are governed by the laws of the jurisdiction listed on the
App Store / Play Store listing.

CONTACT
For questions, write to the email listed on the App Store / Play Store
listing.
`.trim();

export default function LegalDocModal({ visible, doc, onClose }: Props) {
  const title   = doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
  const body    = doc === 'privacy' ? PRIVACY_POLICY    : TERMS_OF_SERVICE;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={s.bg}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
              <Feather name="x" size={20} color="rgba(152, 212, 250, 0.75)" />
            </TouchableOpacity>
          </View>
          <Text style={s.lastUpdated}>Last updated: {LAST_UPDATED}</Text>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.body}>{body}</Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg:   { flex: 1, backgroundColor: '#02060E' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Baskerville',
    color: 'rgba(224, 242, 254, 0.95)',
  },
  closeBtn: { padding: 8 },
  lastUpdated: {
    paddingHorizontal: 20,
    fontSize: 12,
    fontFamily: 'GillSans-Light',
    color: 'rgba(152, 212, 250, 0.55)',
    marginBottom: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224, 242, 254, 0.86)',
  },
});
