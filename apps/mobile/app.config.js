const baseConfig = require("./app.json");

const allowCleartext = process.env.EXPO_ALLOW_CLEARTEXT === "true";
const enableIosAssociatedDomains =
  process.env.EAS_BUILD === "true" ||
  process.env.FINHANCE_IOS_ASSOCIATED_DOMAINS === "true";

module.exports = () => {
  const expo = JSON.parse(JSON.stringify(baseConfig.expo));

  expo.ios = {
    ...expo.ios,
    infoPlist: {
      ...(expo.ios?.infoPlist ?? {}),
      NSAppTransportSecurity: {
        ...(expo.ios?.infoPlist?.NSAppTransportSecurity ?? {}),
        ...(allowCleartext ? { NSAllowsArbitraryLoads: true } : {}),
      },
    },
  };

  if (!enableIosAssociatedDomains) {
    delete expo.ios.associatedDomains;
  }

  expo.android = {
    ...expo.android,
    usesCleartextTraffic: allowCleartext,
  };

  return expo;
};
