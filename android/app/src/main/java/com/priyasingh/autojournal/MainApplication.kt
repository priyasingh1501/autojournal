package com.priyasingh.autojournal

import android.app.Application
import android.content.res.Configuration
import android.util.Log

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import com.livekit.reactnative.LiveKitReactNative

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    Log.e("RN_INIT", "onCreate: start, newArchEnabled=${BuildConfig.IS_NEW_ARCHITECTURE_ENABLED}, releaseLevel=${BuildConfig.REACT_NATIVE_RELEASE_LEVEL}")
    // SoLoader must be the very first native init — both LiveKitReactNative.setup()
    // and ReactNativeFeatureFlags.override() trigger native library loads via SoLoader.
    // loadReactNative() also calls SoLoader.init() internally but that is too late.
    Log.e("RN_INIT", "SoLoader.init: start")
    SoLoader.init(this, false)
    Log.e("RN_INIT", "SoLoader.init: OK")

    // ── Debug point 1: LiveKit setup ─────────────────────────────────────────
    // Risk: LiveKit 2.9.8 + react-native-webrtc 137 may be incompatible with
    // RN 0.81. If setup() throws or loads wrong .so versions, audio will silently
    // fail or crash later when a call starts.
    // Watch for: "LiveKit: FAILED" or subsequent "Audio device module not initialized"
    Log.e("RN_INIT", "LiveKit.setup: start (version check: livekit-rn=2.9.8, webrtc=137.0.3, rn=0.81.5)")
    try {
      LiveKitReactNative.setup(this)
      Log.e("RN_INIT", "LiveKit.setup: OK")
    } catch (t: Throwable) {
      Log.e("RN_INIT", "LiveKit.setup: FAILED — audio features will not work", t)
    }

    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    Log.e("RN_INIT", "releaseLevel: ${DefaultNewArchitectureEntryPoint.releaseLevel}")

    // ── Debug point 2: ReactNativeFeatureFlags.override ──────────────────────
    // Risk: this call was an uncommitted local change of unknown origin — not
    // present in any commit. It may be unnecessary (loadReactNative handles
    // new-arch flag defaults internally). If it causes issues, remove this block
    // and the two imports at the top of this file.
    Log.e("RN_INIT", "FeatureFlags.override: start (IS_NEW_ARCH=${BuildConfig.IS_NEW_ARCHITECTURE_ENABLED})")
    try {
      ReactNativeFeatureFlags.override(ReactNativeNewArchitectureFeatureFlagsDefaults())
      Log.e("RN_INIT", "FeatureFlags.override: OK")
    } catch (t: Throwable) {
      Log.e("RN_INIT", "FeatureFlags.override: FAILED — remove this call if not needed", t)
      // Do not rethrow — loadReactNative may still work without it
    }
    Log.e("RN_INIT", "about to loadReactNative")
    try {
      loadReactNative(this)
      Log.e("RN_INIT", "loadReactNative OK")
    } catch (t: Throwable) {
      Log.e("RN_INIT", "loadReactNative FAILED", t)
      throw t
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    Log.e("RN_INIT", "onCreate: done")
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
