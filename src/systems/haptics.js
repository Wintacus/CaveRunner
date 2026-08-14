/**
 * Haptics — used sparingly, and only for moments that carry meaning. Deliberately NOT
 * wired to jump take-off, landing or crystal pickups: those fire several times a second
 * and would turn into constant background buzz instead of signal.
 *
 * Two back ends:
 *   - Native (Capacitor iOS/Android): the Haptics plugin, which drives the real Taptic
 *     Engine / vibrator with the platform's own impact and notification feels.
 *   - Web: navigator.vibrate directly, with our own patterns. The plugin's web shim maps
 *     everything to a single short buzz (61ms for a heavy impact), which is easy to miss
 *     underneath a death's screen shake and sound. A patterned buzz reads much better.
 *
 * Platform reality check: iOS Safari does not implement the Vibration API at all, so a
 * web build cannot produce haptics on an iPhone no matter what it asks for. Android
 * Chrome does. Native builds get real haptics on both. `haptics.support` reports which
 * case a given device is in, and the ?debug=1 overlay surfaces it on-device.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** What this device can actually do — shown by the debug overlay. */
export const support = {
  get native() {
    return isNative();
  },
  get vibrationApi() {
    return canVibrate();
  },
  get available() {
    return isNative() || canVibrate();
  },
  describe() {
    if (isNative()) return 'native haptics';
    if (canVibrate()) return 'web vibration';
    return 'unsupported on this device';
  }
};

/** Last event that was requested, and whether it actually went anywhere. */
export const lastEvent = { name: '-', delivered: false };

async function fire(name, nativeCall, webPattern) {
  lastEvent.name = name;
  lastEvent.delivered = false;

  if (isNative()) {
    try {
      await nativeCall();
      lastEvent.delivered = true;
      return;
    } catch {
      // Fall through to the web path rather than dropping the cue entirely.
    }
  }

  if (canVibrate()) {
    // navigator.vibrate returns false if the request was refused (e.g. no user gesture yet).
    lastEvent.delivered = navigator.vibrate(webPattern) !== false;
  }
}

export const haptics = {
  /** Sharp, unmistakable impact — taking a hit / dying. */
  hit: () => fire('hit', () => Haptics.impact({ style: ImpactStyle.Heavy }), [55, 40, 90]),
  /** Light confirmation tap — checkpoint reached. */
  checkpoint: () => fire('checkpoint', () => Haptics.impact({ style: ImpactStyle.Light }), [25]),
  /** Positive double tap, distinct from the checkpoint — power-up collected. */
  powerup: () => fire('powerup', () => Haptics.notification({ type: NotificationType.Success }), [20, 60, 20]),
  /** Stronger celebratory buzz — level complete. */
  win: () => fire('win', () => Haptics.notification({ type: NotificationType.Success }), [70, 50, 70, 50, 130])
};
