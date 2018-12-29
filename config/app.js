// config that are specific to --target app
const fs = require('fs');
const path = require('path');

// ensure the filename passed to html-webpack-plugin is a relative path
// because it cannot correctly handle absolute paths
function ensureRelative(outputDir, _path) {
  if (path.isAbsolute(_path)) {
    return path.relative(outputDir, _path);
  } else {
    return _path;
  }
}

module.exports = (api, options) => {
  api.chainWebpack(webpackConfig => {
    const isProd = process.env.NODE_ENV === 'production';
    const outputDir = api.resolve(options.outputDir);

    // code splitting
    if (isProd) {
      webpackConfig.optimization.splitChunks({
        cacheGroups: {
          vendors: {
            name: `chunk-vendors`,
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
            chunks: 'initial',
          },
          common: {
            name: `chunk-common`,
            minChunks: 2,
            priority: -20,
            chunks: 'initial',
            reuseExistingChunk: true,
          },
        },
      });
    }

    // HTML plugin
    const resolveClientEnv = require('../scripts/utils/resolveClientEnv');

    // #1669 html-webpack-plugin's default sort uses toposort which cannot
    // handle cyclic deps in certain cases. Monkey patch it to handle the case
    // before we can upgrade to its 4.0 version (incompatible with preload atm)
    const chunkSorters = require('html-webpack-plugin/lib/chunksorter');
    const depSort = chunkSorters.dependency;
    chunkSorters.auto = chunkSorters.dependency = (chunks, ...args) => {
      try {
        return depSort(chunks, ...args);
      } catch (e) {
        // fallback to a manual sort if that happens...
        return chunks.sort((a, b) => {
          // make sure user entry is loaded last so user CSS can override
          // vendor CSS
          if (a.id === 'app') {
            return 1;
          } else if (b.id === 'app') {
            return -1;
          } else if (a.entry !== b.entry) {
            return b.entry ? -1 : 1;
          }
          return 0;
        });
      }
    };

    const htmlOptions = {
      templateParameters: (compilation, assets, pluginOptions) => {
        // enhance html-webpack-plugin's built in template params
        let stats;
        return Object.assign(
          {
            // make stats lazy as it is expensive
            get webpack() {
              return stats || (stats = compilation.getStats().toJson());
            },
            compilation: compilation,
            webpackConfig: compilation.options,
            htmlWebpackPlugin: {
              files: assets,
              options: pluginOptions,
            },
          },
          resolveClientEnv(options, true /* raw */)
        );
      },
    };

    if (isProd) {
      // handle indexPath
      if (options.indexPath !== 'index.html') {
        // why not set filename for html-webpack-plugin?
        // 1. It cannot handle absolute paths
        // 2. Relative paths causes incorrect SW manifest to be generated (#2007)
        webpackConfig
          .plugin('move-index')
          .use(require('./webpack/MovePlugin'), [
            path.resolve(outputDir, 'index.html'),
            path.resolve(outputDir, options.indexPath),
          ]);
      }

      Object.assign(htmlOptions, {
        minify: {
          removeComments: true,
          collapseWhitespace: true,
          removeAttributeQuotes: true,
          collapseBooleanAttributes: true,
          removeScriptTypeAttributes: true,
          // more options:
          // https://github.com/kangax/html-minifier#options-quick-reference
        },
      });

      // keep chunk ids stable so async chunks have consistent hash (#1916)
      webpackConfig.plugin('named-chunks').use(require('webpack/lib/NamedChunksPlugin'), [
        chunk => {
          if (chunk.name) {
            return chunk.name;
          }

          const hash = require('hash-sum');
          const joinedHash = hash(Array.from(chunk.modulesIterable, m => m.id).join('_'));
          return `chunk-` + joinedHash;
        },
      ]);
    }

    // resolve HTML file(s)
    const HTMLPlugin = require('html-webpack-plugin');
    const PreloadPlugin = require('preload-webpack-plugin');
    const htmlPath = api.resolve('public/index.html');
    const publicCopyIgnore = ['index.html', '.DS_Store'];

    htmlOptions.template = htmlPath;

    webpackConfig.plugin('html').use(HTMLPlugin, [htmlOptions]);

    if (isProd) {
      // inject preload/prefetch to HTML
      webpackConfig.plugin('preload').use(PreloadPlugin, [
        {
          rel: 'preload',
          include: 'initial',
          fileBlacklist: [/\.map$/, /hot-update\.js$/],
        },
      ]);
      webpackConfig.plugin('prefetch').use(PreloadPlugin, [
        {
          rel: 'prefetch',
          include: 'asyncChunks',
        },
      ]);
    }

    // CORS and Subresource Integrity
    if (options.crossorigin != null || options.integrity) {
      webpackConfig.plugin('cors').use(require('./webpack/CorsPlugin'), [
        {
          crossorigin: options.crossorigin,
          integrity: options.integrity,
          baseUrl: options.baseUrl,
        },
      ]);
    }

    // copy static assets in public/
    const publicDir = api.resolve('public');
    if (fs.existsSync(publicDir)) {
      webpackConfig.plugin('copy').use(require('copy-webpack-plugin'), [
        [
          {
            from: publicDir,
            to: outputDir,
            toType: 'dir',
            ignore: publicCopyIgnore,
          },
        ],
      ]);
    }
  });
};
