const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function withATSBypass(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsArbitraryLoadsInWebContent: true,
      NSAllowsLocalNetworking: true
    };
    return config;
  });
};
