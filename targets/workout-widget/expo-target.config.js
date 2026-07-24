/**
 * Workout Live Activity widget-extension target (lock-screen set logging).
 *
 * Linked into ios/ by @bacons/apple-targets at prebuild; every Swift file in
 * this folder compiles into the extension, and files in `_shared/` compile
 * into BOTH the extension and the main app target (required so the
 * LiveActivityIntents run in-process in the app — see
 * docs/workout-live-activity.md).
 *
 * Deployment target 17.0: interactive buttons (Button(intent:)) are iOS 17+.
 * On iOS 16 devices the extension is simply inactive; the app is unaffected.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'WorkoutActivity',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'ActivityKit', 'AppIntents'],
  colors: {
    // Fitbull primary (tailwind --primary, hsl(24 95% 53%)).
    AccentColor: '#F97316',
  },
});
