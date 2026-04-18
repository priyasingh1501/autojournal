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
