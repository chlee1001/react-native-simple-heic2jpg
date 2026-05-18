module.exports = function (api) {
  const isTest = api.env('test');

  return {
    presets: [
      isTest
        ? 'module:@react-native/babel-preset'
        : 'module:react-native-builder-bob/babel-preset',
    ],
  };
};
