/**
 * InAppUpdatesService — Google Play in-app update prompt for Android.
 *
 * Why this exists: users who turned off Play Store auto-updates would
 * otherwise stay on the version they installed forever. This module asks
 * Google's in-app update API on launch, and if a newer version is
 * published to the same Play Store track, shows a flexible update flow:
 *
 *   1. Google's native dialog appears: "Update available — Update / Not now"
 *   2. If accepted, the new APK downloads in the background.
 *   3. Once download completes, we show our own short Alert offering to
 *      install + restart now.
 *
 * Caveats
 *   • Only works for builds installed FROM the Play Store. Sideloaded
 *     APKs and EAS internal/preview builds will always return
 *     `shouldUpdate: false`, so this is effectively a no-op in dev.
 *   • iOS has no equivalent API — App Store requires the user to update
 *     manually via the Updates tab, so we Platform.OS-gate to Android.
 *
 * Failures are swallowed silently — a broken update prompt should never
 * block the user from using the app.
 */

import { Alert, Platform } from 'react-native';
import { track } from './AnalyticsService';

export async function maybePromptForUpdate(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Lazy require so the native module isn't loaded on iOS or web at all.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('sp-react-native-in-app-updates');
    const SpInAppUpdates = mod.default;
    const { IAUUpdateKind, IAUInstallStatus } = mod;

    const inAppUpdates = new SpInAppUpdates(false /* isDebug */);

    const result = await inAppUpdates.checkNeedsUpdate();
    if (!result?.shouldUpdate) return;

    track('app_update_prompt_shown');
    // Flexible flow: user keeps using the app while it downloads.
    await inAppUpdates.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });

    // Listen for download completion so we can prompt the user to install.
    inAppUpdates.addStatusUpdateListener((status: { status: number }) => {
      if (status.status === IAUInstallStatus.DOWNLOADED) {
        Alert.alert(
          'Update ready',
          'A new version of untangle has finished downloading. Restart now to apply it?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart',
              onPress: () => {
                track('app_update_installed');
                // Triggers Google's confirm dialog, then restarts the app.
                inAppUpdates.installUpdate();
              },
            },
          ],
        );
      }
    });
  } catch (e) {
    // Common in dev — module not linked, or API unreachable. Don't bother
    // the user.
    if (__DEV__) console.warn('[InAppUpdates] check failed:', e);
  }
}
