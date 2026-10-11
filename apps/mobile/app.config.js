/**
 * Extends app.json. Internal preview APKs are sideloaded onto real phones, so they ship arm64-v8a
 * only instead of a universal 4-ABI APK. Production uses an AAB, where Play splits per ABI itself.
 *
 * The Meta (Facebook) SDK plugin is only applied when EXPO_PUBLIC_FACEBOOK_APP_ID and
 * FACEBOOK_CLIENT_TOKEN are set, because its prebuild step fails without an app ID.
 */
module.exports = ({ config }) => {
  let plugins = config.plugins ?? [];

  const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim();
  const facebookClientToken = process.env.FACEBOOK_CLIENT_TOKEN?.trim();
  if (facebookAppId && facebookClientToken) {
    plugins = [
      ...plugins,
      [
        "react-native-fbsdk-next",
        {
          appID: facebookAppId,
          clientToken: facebookClientToken,
          displayName: config.name,
          scheme: `fb${facebookAppId}`,
          advertiserIDCollectionEnabled: true,
          autoLogAppEventsEnabled: true,
          isAutoInitEnabled: true,
          iosUserTrackingPermission: false,
        },
      ],
    ];
  }

  if (process.env.EAS_BUILD_PROFILE === "preview") {
    plugins = plugins.map((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      if (name !== "expo-build-properties") return plugin;
      const options = (Array.isArray(plugin) && plugin[1]) || {};
      return ["expo-build-properties", { ...options, android: { ...options.android, buildArchs: ["arm64-v8a"] } }];
    });
  }

  return { ...config, plugins };
};
