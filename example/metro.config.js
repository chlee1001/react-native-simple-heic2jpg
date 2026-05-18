const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { getConfig } = require('react-native-builder-bob/metro-config');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

const baseConfig = getDefaultConfig(__dirname);

// RN 0.85 ships resolver.blockList as a RegExp; react-native-monorepo-config
// (used by bob's metro-config) spreads it as if it were an array. Wrap it so
// the spread succeeds until upstream fixes the assumption.
if (
  baseConfig.resolver?.blockList &&
  !Array.isArray(baseConfig.resolver.blockList)
) {
  baseConfig.resolver.blockList = [baseConfig.resolver.blockList];
}

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
module.exports = getConfig(baseConfig, {
  root,
  pkg,
  project: __dirname,
});
