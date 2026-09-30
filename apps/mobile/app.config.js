/**
 * Extends app.json. Internal preview APKs are sideloaded onto real phones, so they ship arm64-v8a
 * only instead of a universal 4-ABI APK. Production uses an AAB, where Play splits per ABI itself.
 */
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD_PROFILE !== "preview") return config;
  const plugins = (config.plugins ?? []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== "expo-build-properties") return plugin;
    const options = (Array.isArray(plugin) && plugin[1]) || {};
    return ["expo-build-properties", { ...options, android: { ...options.android, buildArchs: ["arm64-v8a"] } }];
  });
  return { ...config, plugins };
};
