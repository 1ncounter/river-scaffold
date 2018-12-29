module.exports = (api, options) => {
  api.chainWebpack(webpackConfig => {
    if (process.env.NODE_ENV === 'production') {
      const isLegacyBundle = process.env.CLI_MODERN_MODE && !process.env.CLI_MODERN_BUILD;
      const getAssetPath = require('../scripts/utils/getAssetPath');
      const filename = getAssetPath(
        options,
        `js/[name]${isLegacyBundle ? `-legacy` : ``}${options.filenameHashing ? '.[contenthash:8]' : ''}.js`
      );

      webpackConfig
        .mode('production')
        .devtool(options.productionSourceMap ? 'source-map' : false)
        .output.filename(filename)
        .chunkFilename(filename);

      // keep module.id stable when vendor modules does not change
      webpackConfig.plugin('hash-module-ids').use(require('webpack/lib/HashedModuleIdsPlugin'), [
        {
          hashDigest: 'hex',
        },
      ]);
      // disable optimization during tests to speed things up
      if (process.env.CLI_TEST) {
        webpackConfig.optimization.minimize(false);
      } else {
        const TerserPlugin = require('terser-webpack-plugin');
        const terserOptions = require('./terserOptions')(options);
        webpackConfig.optimization.minimizer('terser').use(TerserPlugin, [terserOptions]);
      }
    }
  });
};
