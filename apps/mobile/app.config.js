const baseConfig = require("./app.json");

const allowCleartext = process.env.EXPO_ALLOW_CLEARTEXT === "true";

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

  expo.android = {
    ...expo.android,
    usesCleartextTraffic: allowCleartext,
  };

  return expo;
};
