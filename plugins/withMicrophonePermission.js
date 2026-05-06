// Custom Expo config plugin that directly injects android.permission.RECORD_AUDIO
// into the AndroidManifest.xml. This is a guaranteed fallback in case expo-av's
// plugin doesn't add it in newer SDK versions.
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withMicrophonePermission(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults;

    // Ensure the manifest root has a usesPermission array
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }

    const permissions = manifest.manifest['uses-permission'];

    const REQUIRED = [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_SMS',
    ];

    for (const perm of REQUIRED) {
      const alreadyPresent = permissions.some(
        (p) => p.$?.['android:name'] === perm,
      );
      if (!alreadyPresent) {
        permissions.push({ $: { 'android:name': perm } });
      }
    }

    return androidConfig;
  });
};
