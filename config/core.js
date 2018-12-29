module.exports = (api, options) => {
  api.chainWebpack(webpackConfig => {
    const isLegacyBundle = process.env.CLI_MODERN_MODE && !process.env.CLI_MODERN_BUILD;
    const resolveLocal = require('../scripts/utils/resolveLocal');
    const getAssetPath = require('../scripts/utils/getAssetPath');
    const inlineLimit = 4096;

    const genAssetSubPath = dir => {
      return getAssetPath(options, `${dir}/[name]${options.filenameHashing ? '.[hash:8]' : ''}.[ext]`);
    };

    const genUrlLoaderOptions = dir => {
      return {
        limit: inlineLimit,
        // use explicit fallback to avoid regression in url-loader>=1.1.0
        fallback: {
          loader: 'file-loader',
          options: {
            name: genAssetSubPath(dir),
          },
        },
      };
    };

    webpackConfig
      .mode('development')
      .context(api.service.context)
      .entry('app')
      .add(resolveLocal('src/main.ts'))
      .end()
      .output.path(api.resolve(options.outputDir))
      .filename(isLegacyBundle ? '[name]-legacy.js' : '[name].js')
      .publicPath(options.baseUrl);

    webpackConfig.resolve.extensions
      .merge(['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json', '.wasm'])
      .end()
      .modules.add('node_modules')
      .add(api.resolve('node_modules'))
      .add(resolveLocal('node_modules'))
      .end()
      .alias.set('@', api.resolve('src'));

    webpackConfig.resolveLoader.modules
      .add('node_modules')
      .add(api.resolve('node_modules'))
      .add(resolveLocal('node_modules'));

    // static assets -----------------------------------------------------------

    webpackConfig.module
      .rule('compile')
      .test(/\.(ts|tsx)$/)
      .include.add(resolveLocal('src'))
      .end()
      .use('ts-loader')
      .loader('ts-loader');

    webpackConfig.module
      .rule('images')
      .test(/\.(png|jpe?g|gif|webp)(\?.*)?$/)
      .use('url-loader')
      .loader('url-loader')
      .options(genUrlLoaderOptions('img'));

    webpackConfig.module
      .rule('media')
      .test(/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/)
      .use('url-loader')
      .loader('url-loader')
      .options(genUrlLoaderOptions('media'));

    webpackConfig.module
      .rule('fonts')
      .test(/\.(woff2?|eot|ttf|otf)(\?.*)?$/i)
      .use('url-loader')
      .loader('url-loader')
      .options(genUrlLoaderOptions('fonts'));

    const resolveClientEnv = require('../scripts/utils/resolveClientEnv');
    webpackConfig.plugin('define').use(require('webpack/lib/DefinePlugin'), [resolveClientEnv(options)]);

    webpackConfig.plugin('case-sensitive-paths').use(require('case-sensitive-paths-webpack-plugin'));

    // friendly error plugin displays very confusing errors when webpack
    // fails to resolve a loader, so we provide custom handlers to improve it
    const { transformer, formatter } = require('../scripts/utils/resolveLoaderError');
    webpackConfig.plugin('friendly-errors').use(require('friendly-errors-webpack-plugin'), [
      {
        additionalTransformers: [transformer],
        additionalFormatters: [formatter],
      },
    ]);
  });
};
