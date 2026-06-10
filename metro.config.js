const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// إضافة منصة web (هذا السطر المهم)
config.resolver.platforms = [...config.resolver.platforms, 'web'];

config.watchFolders = [];
config.resolver.blockList = [
  /\.local\/.*/,
];

module.exports = config;
