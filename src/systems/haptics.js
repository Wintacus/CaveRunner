/**
 * Haptics — Capacitor's Haptics plugin on device, navigator.vibrate as the web fallback.
 *
 * Used sparingly and only for moments that carry meaning. Deliberately NOT wired to jump
 * take-off, landing or crystal pickups: those fire several times a second and would turn
 * into constant background buzz instead of signal.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

let available = true;

async function safe(fn, fallbackPattern) {
  if (!available) return;
  try {
    await fn();
  } catch {
    // Plugin missing (plain browser, or a build without the plugin) — degrade quietly.
    if (navigator.vibrate && fallbackPattern) navigator.vibrate(fallbackPattern);
    else available = false;
  }
}

export const haptics = {
  /** Sharp impact — taking a hit / dying. */
  hit: () => safe(() => Haptics.impact({ style: ImpactStyle.Heavy }), [40, 30, 60]),
  /** Light confirmation tap — checkpoint reached. */
  checkpoint: () => safe(() => Haptics.impact({ style: ImpactStyle.Light }), 18),
  /** Distinct positive double-tap — power-up collected. */
  powerup: () => safe(() => Haptics.notification({ type: NotificationType.Success }), [14, 50, 14]),
  /** Stronger celebratory buzz — level complete. */
  win: () => safe(() => Haptics.notification({ type: NotificationType.Success }), [60, 40, 120])
};
