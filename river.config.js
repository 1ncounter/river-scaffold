const webpack = require('webpack');

module.exports = {
  chainWebpack: webpackConfig => {},
  configureWebpack: {
    plugins: [new webpack.WatchIgnorePlugin([/css\.d\.ts$/, /styl\.d\.ts$/])],
  },
  css: {
    modules: true,
  },
  devServer: {
    open: process.platform === 'darwin',
    host: '0.0.0.0',
    port: 8080,
    https: false,
    hotOnly: false,
    proxy: null, // string | Object
    before: app => {
      // app is an express instance
    },
  },
};
