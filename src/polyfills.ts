// Polyfills for React Native — must be imported first in App.tsx.
// Some web APIs are missing from Hermes/JSC.

// DOMException — used by @elevenlabs/react-native and other packages that
// expect a browser-like environment.
if (typeof (global as any).DOMException === 'undefined') {
  class DOMExceptionPolyfill extends Error {
    readonly code: number;
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? 'Error';
      this.code = 0;
    }
  }
  (global as any).DOMException = DOMExceptionPolyfill;
}

// HTMLAudioElement — @elevenlabs/client checks `"setSinkId" in HTMLAudioElement.prototype`
// at runtime; React Native has no DOM so this class doesn't exist.
if (typeof (global as any).HTMLAudioElement === 'undefined') {
  (global as any).HTMLAudioElement = class HTMLAudioElement {
    // setSinkId is not supported in React Native — the check in the lib
    // will see it's absent and throw its own "not supported" error rather
    // than crashing on `undefined.prototype`.
  };
}
