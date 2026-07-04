const { withInfoPlist } = require('expo/config-plugins');

const MICROPHONE_USAGE =
  'Fitbull uses the microphone so you can dictate messages to your AI coach instead of typing.';

/**
 * expo-camera and expo-image-picker are configured with `microphonePermission: false`,
 * which *deletes* NSMicrophoneUsageDescription from the Info.plist — Expo's
 * `createPermissionsPlugin` strips keys set to `false` ("block the permissions so
 * no package can add them"). We legitimately use the microphone for in-chat
 * dictation (expo-speech-recognition), so re-add the key here.
 *
 * IMPORTANT: this plugin must stay FIRST in app.json's `plugins` array. Expo
 * runs `withInfoPlist` mods in *reverse* registration order (last-registered
 * runs first), so registering first makes this mod run last — after the
 * camera/image-picker deletions — and win. Camera/image-picker keep
 * `microphonePermission: false` on purpose: those features don't record audio.
 */
module.exports = function withMicrophoneUsage(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSMicrophoneUsageDescription = MICROPHONE_USAGE;
    return cfg;
  });
};
