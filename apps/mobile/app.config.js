const {
  assertProductionEndpoints,
  publicHttps,
} = require("./src/api/release-policy");

module.exports = ({ config }) => {
  if (
    process.env.EAS_BUILD_PROFILE === "production" ||
    process.env.EXPO_PUBLIC_APP_ENV === "production"
  ) {
    if (process.env.EXPO_PUBLIC_APP_ENV !== "production")
      throw new Error(
        "Production builds must set EXPO_PUBLIC_APP_ENV=production.",
      );
    assertProductionEndpoints(
      process.env.EXPO_PUBLIC_API_URL,
      process.env.EXPO_PUBLIC_SOCKET_URL,
    );
    for (const value of [
      process.env.EXPO_PUBLIC_PRIVACY_URL,
      process.env.EXPO_PUBLIC_CHILD_SAFETY_URL,
      process.env.EXPO_PUBLIC_TERMS_URL,
      process.env.EXPO_PUBLIC_COMMUNITY_URL,
    ])
      publicHttps(value);
    return {
      ...config,
      android: {
        ...config.android,
        blockedPermissions: [
          ...(config.android.blockedPermissions || []),
          "android.permission.SYSTEM_ALERT_WINDOW",
        ],
      },
    };
  }
  return config;
};
