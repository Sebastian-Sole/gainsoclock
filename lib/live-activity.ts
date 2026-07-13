// Rest-timer Live Activity (Dynamic Island + Lock Screen), iOS 16.2+.
//
// Wraps `expo-live-activity` the same way lib/haptics.ts wraps expo-haptics:
// components and hooks call these functions unconditionally and the wrapper
// decides whether anything happens. All expo-live-activity access stays in
// this file (same rule as HealthKit in lib/healthkit.ts).
//
// Degradation contract (spike requirement, see docs/rest-timer-live-activity.md):
// every path is a silent no-op when any of these hold —
//   - Platform is Android/web,
//   - the JS package is present but the native module wasn't compiled into the
//     dev client (expo-live-activity uses requireOptionalNativeModule, so the
//     import succeeds and the module object is null → calls would throw),
//   - iOS < 16.2 or the user disabled Live Activities (native side throws),
//   - the widget extension target is missing from the binary (activity starts
//     but renders nothing, or the request fails).
// The rest timer itself must never break because of this feature.
import { Platform } from 'react-native';

type LiveActivityModule = typeof import('expo-live-activity');

let cachedModule: LiveActivityModule | null = null;
let loadFailed = false;

// The id of the currently running rest activity. The rest timer is a
// singleton (one per active workout), so a single id is enough.
let activityId: string | null = null;

function getLiveActivity(): LiveActivityModule | null {
  if (Platform.OS !== 'ios') return null;
  if (loadFailed) return null;
  if (cachedModule) return cachedModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('expo-live-activity') as LiveActivityModule;
    return cachedModule;
  } catch {
    loadFailed = true;
    if (__DEV__) {
      console.warn(
        '[LiveActivity] expo-live-activity unavailable — rebuild the dev client to enable the rest-timer Live Activity.'
      );
    }
    return null;
  }
}

/**
 * Start (or retarget) the rest-timer Live Activity counting down to `endsAt`.
 * ActivityKit renders the countdown natively (`Text(timerInterval:)`), so no
 * further updates are needed while the timer runs. Calling again while an
 * activity is live (e.g. "+15" or a new set) updates it in place.
 */
export function startRestActivity(endsAt: Date, exerciseName?: string): void {
  const liveActivity = getLiveActivity();
  if (!liveActivity) return;

  const state = {
    title: 'Rest Timer',
    subtitle: exerciseName,
    progressBar: { date: endsAt.getTime() },
  };

  try {
    if (activityId) {
      liveActivity.updateActivity(activityId, state);
      return;
    }
    activityId =
      liveActivity.startActivity(state, {
        timerType: 'digital',
        // Tapping the island/lock-screen card brings the logger back up.
        deepLinkUrl: 'fitbull://workout/active',
      }) ?? null;
  } catch {
    // Native module null on this build, iOS < 16.2, or Live Activities
    // disabled by the user — the in-app timer and OS notification still work.
    activityId = null;
  }
}

/**
 * End the rest-timer Live Activity (skip, expiry, workout finish/discard).
 * Safe to call when no activity is running.
 */
export function endRestActivity(): void {
  if (!activityId) return;
  const liveActivity = getLiveActivity();
  if (!liveActivity) return;

  const id = activityId;
  activityId = null;
  try {
    liveActivity.stopActivity(id, { title: 'Rest Timer' });
  } catch {
    // Already ended or module unavailable — nothing to clean up.
  }
}
