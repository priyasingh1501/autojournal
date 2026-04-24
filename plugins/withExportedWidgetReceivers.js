// Custom Expo config plugin that forces `android:exported="true"` on every
// AppWidget receiver in the AndroidManifest.
//
// Context: react-native-android-widget's plugin hardcodes exported="false" on
// receivers it generates. On Android 12+ (targetSdk >= 31) the system launcher
// runs in a different process and cannot discover widget receivers that are
// not exported, so widgets never appear in the "Add widget" picker — the app
// renders fine but the widget is simply invisible to the user.
//
// This plugin runs AFTER the widget plugin (plugin order in app.json) and
// flips exported="false" → "true" on any receiver whose intent-filter includes
// android.appwidget.action.APPWIDGET_UPDATE. Safe to run even when no widgets
// are registered — it's a no-op in that case.
const { withAndroidManifest } = require('@expo/config-plugins');

const APPWIDGET_UPDATE = 'android.appwidget.action.APPWIDGET_UPDATE';

function isAppWidgetReceiver(receiver) {
  const filters = receiver['intent-filter'];
  if (!Array.isArray(filters)) return false;
  return filters.some((f) => {
    const actions = Array.isArray(f.action) ? f.action : [];
    return actions.some((a) => a.$?.['android:name'] === APPWIDGET_UPDATE);
  });
}

module.exports = function withExportedWidgetReceivers(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const app = androidConfig.modResults.manifest.application?.[0];
    if (!app?.receiver) return androidConfig;

    for (const receiver of app.receiver) {
      if (isAppWidgetReceiver(receiver)) {
        receiver.$['android:exported'] = 'true';
      }
    }
    return androidConfig;
  });
};
