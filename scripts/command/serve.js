const { info } = require('@vue/cli-shared-utils');

const defaults = {
  host: '0.0.0.0',
  port: 8080,
  https: false,
};

module.exports = (api, options) => {
  api.registerCommand(
    'serve',
    {
      description: 'start development server',
      usage: 'cli-service serve [options] [entry]',
      options: {
        '--mode': `specify env mode (default: development)`,
        '--host': `specify host (default: ${defaults.host})`,
        '--port': `specify port (default: ${defaults.port})`,
        '--https': `use https (default: ${defaults.https})`,
      },
    },
    async function serve(args) {
      info('Starting development server...');

      const isProduction = process.env.NODE_ENV === 'production';

      const url = require('url');
      const path = require('path');
      const chalk = require('chalk');
      const webpack = require('webpack');
      const WebpackDevServer = require('webpack-dev-server');
      const portfinder = require('portfinder');
      const prepareProxy = require('../utils/prepareProxy');
      const prepareURLs = require('../utils/prepareURLs');
      const isAbsoluteUrl = require('../utils/isAbsoluteUrl');
      const validateWebpackConfig = require('../utils/validateWebpackConfig');

      // resolve webpack config
      const webpackConfig = api.resolveWebpackConfig();

      // check for common config errors
      validateWebpackConfig(webpackConfig, api, options);

      // load user devServer options with higher priority than devServer
      // in webpck config
      const projectDevServerOptions = Object.assign(webpackConfig.devServer || {}, options.devServer);

      // entry arg
      const entry = args._[0];
      if (entry) {
        webpackConfig.entry = {
          app: api.resolve(entry),
        };
      }

      // resolve server options
      const useHttps = args.https || projectDevServerOptions.https || defaults.https;
      const protocol = useHttps ? 'https' : 'http';
      const host = args.host || process.env.HOST || projectDevServerOptions.host || defaults.host;
      portfinder.basePort = args.port || process.env.PORT || projectDevServerOptions.port || defaults.port;
      const port = await portfinder.getPortPromise();
      const rawPublicUrl = args.public || projectDevServerOptions.public;
      const publicUrl = rawPublicUrl
        ? /^[a-zA-Z]+:\/\//.test(rawPublicUrl)
          ? rawPublicUrl
          : `${protocol}://${rawPublicUrl}`
        : null;

      const urls = prepareURLs(protocol, host, port, isAbsoluteUrl(options.baseUrl) ? '/' : options.baseUrl);

      const proxySettings = prepareProxy(projectDevServerOptions.proxy, api.resolve('public'));

      // inject dev & hot-reload middleware entries
      if (!isProduction) {
        const sockjsUrl = publicUrl
          ? // explicitly configured via devServer.public
            `?${publicUrl}/sockjs-node`
          : // otherwise infer the url
            `?` +
            url.format({
              protocol,
              port,
              hostname: urls.lanUrlForConfig || 'localhost',
              pathname: '/sockjs-node',
            });
        const devClients = [
          // dev server client
          require.resolve(`webpack-dev-server/client`) + sockjsUrl,
          // hmr client
          require.resolve(projectDevServerOptions.hotOnly ? 'webpack/hot/only-dev-server' : 'webpack/hot/dev-server'),
          // TODO custom overlay client
          // `@vue/cli-overlay/dist/client`
        ];
        if (process.env.APPVEYOR) {
          devClients.push(`webpack/hot/poll?500`);
        }
        // inject dev/hot client
        addDevClientToEntry(webpackConfig, devClients);
      }

      // create compiler
      const compiler = webpack(webpackConfig);

      // create server
      const server = new WebpackDevServer(
        compiler,
        Object.assign(
          {
            clientLogLevel: 'none',
            historyApiFallback: {
              disableDotRule: true,
              rewrites: [{ from: /./, to: path.posix.join(options.baseUrl, 'index.html') }],
            },
            contentBase: api.resolve('public'),
            watchContentBase: !isProduction,
            hot: !isProduction,
            quiet: true,
            compress: isProduction,
            publicPath: options.baseUrl,
            overlay: isProduction // TODO disable this
              ? false
              : { warnings: false, errors: true },
          },
          projectDevServerOptions,
          {
            https: useHttps,
            proxy: proxySettings,
            before(app, server) {
              // allow other plugins to register middlewares, e.g. PWA
              api.service.devServerConfigFns.forEach(fn => fn(app, server));
              // apply in project middlewares
              projectDevServerOptions.before && projectDevServerOptions.before(app, server);
            },
          }
        )
      );

      return new Promise((resolve, reject) => {
        let isFirstCompile = true;

        compiler.hooks.done.tap('cli-service serve', stats => {
          if (stats.hasErrors()) {
            return;
          }

          const networkUrl = publicUrl ? publicUrl.replace(/([^/])$/, '$1/') : urls.lanUrlForTerminal;

          console.log();
          console.log(`  App running at:`);
          console.log(`  - Local:   ${chalk.cyan(urls.localUrlForTerminal)}`);
          console.log(`  - Network: ${chalk.cyan(networkUrl)}`);
          console.log();

          if (isFirstCompile) {
            isFirstCompile = false;

            if (!isProduction) {
              console.log(`  Note that the development build is not optimized.`);
              console.log(`  To create a production build, run ${chalk.cyan('build')}.`);
            } else {
              console.log(`  App is served in production mode.`);
              console.log(`  Note this is for preview or E2E testing only.`);
            }
            console.log();

            // resolve returned Promise
            // so other commands can do api.service.run('serve').then(...)
            resolve({
              server,
              url: urls.localUrlForBrowser,
            });
          } else if (process.env.CLI_TEST) {
            // signal for test to check HMR
            console.log('App updated');
          }

          server.listen(port, host, err => {
            if (err) {
              reject(err);
            }
          });
        });
      });
    }
  );
};

function addDevClientToEntry(config, devClient) {
  const { entry } = config;
  if (typeof entry === 'object' && !Array.isArray(entry)) {
    Object.keys(entry).forEach(key => {
      entry[key] = devClient.concat(entry[key]);
    });
  } else if (typeof entry === 'function') {
    config.entry = entry(devClient);
  } else {
    config.entry = devClient.concat(entry);
  }
}

// https://stackoverflow.com/a/20012536
function checkInContainer() {
  const fs = require('fs');
  if (fs.existsSync(`/proc/1/cgroup`)) {
    const content = fs.readFileSync(`/proc/1/cgroup`, 'utf-8');
    return /:\/(lxc|docker|kubepods)\//.test(content);
  }
}

module.exports.defaultModes = {
  serve: 'development',
};
