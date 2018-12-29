const defaults = {
  clean: true,
  target: 'app',
  formats: 'commonjs,umd,umd-min',
  'unsafe-inline': true,
};

const modifyConfig = (config, fn) => {
  if (Array.isArray(config)) {
    config.forEach(c => fn(c));
  } else {
    fn(config);
  }
};

module.exports = (api, options) => {
  api.registerCommand(
    'build',
    {
      description: 'build for production',
      usage: 'cli-service build [options] [entry|pattern]',
      options: {
        '--mode': `specify env mode (default: production)`,
        '--dest': `specify output directory (default: ${options.outputDir})`,
        '--modern': `build app targeting modern browsers with auto fallback`,
      },
    },
    async args => {
      for (const key in defaults) {
        if (args[key] == null) {
          args[key] = defaults[key];
        }
      }
      args.entry = args.entry || args._[0];

      process.env.CLI_BUILD_TARGET = args.target;
      if (args.modern && args.target === 'app') {
        process.env.CLI_MODERN_MODE = true;
        delete process.env.CLI_MODERN_BUILD;
        await build(
          Object.assign({}, args, {
            modernBuild: false,
            keepAlive: true,
          }),
          api,
          options
        );

        process.env.CLI_MODERN_BUILD = true;
        await build(
          Object.assign({}, args, {
            modernBuild: true,
            clean: false,
          }),
          api,
          options
        );

        delete process.env.CLI_MODERN_MODE;
        delete process.env.CLI_MODERN_BUILD;
      } else {
        if (args.modern) {
          const { warn } = require('@vue/cli-shared-utils');
          warn(
            `Modern mode only works with default target (app). ` +
              `For libraries or web components, use the browserslist ` +
              `config to specify target browsers.`
          );
        }

        await build(args, api, options);
      }
      delete process.env.CLI_BUILD_TARGET;
    }
  );
};

async function build(args, api, options) {
  const fs = require('fs-extra');
  const path = require('path');
  const chalk = require('chalk');
  const webpack = require('webpack');
  const formatStats = require('./formatStats');
  const validateWebpackConfig = require('../../../scripts/utils/validateWebpackConfig');
  const { log, done, info, logWithSpinner, stopSpinner } = require('@vue/cli-shared-utils');

  log();
  const mode = api.service.mode;
  if (args.target === 'app') {
    const bundleTag = args.modern ? (args.modernBuild ? `modern bundle ` : `legacy bundle `) : ``;
    logWithSpinner(`Building ${bundleTag}for ${mode}...`);
  } else {
    const additionalParams = ` (${args.formats})`;
    logWithSpinner(`Building for ${mode} as ${buildMode}${additionalParams}...`);
  }

  const targetDir = api.resolve(args.dest || options.outputDir);
  const isLegacyBuild = args.target === 'app' && args.modern && !args.modernBuild;

  // resolve raw webpack config
  let webpackConfig = require('./resolveConfig')(api, args, options);

  // check for common config errors
  validateWebpackConfig(webpackConfig, api, options, args.target);

  // apply inline dest path after user configureWebpack hooks
  // so it takes higher priority
  if (args.dest) {
    modifyConfig(webpackConfig, config => {
      config.output.path = targetDir;
    });
  }

  if (args.watch) {
    modifyConfig(webpackConfig, config => {
      config.watch = true;
    });
  }

  if (args.clean) {
    await fs.remove(targetDir);
  }

  return new Promise((resolve, reject) => {
    webpack(webpackConfig, (err, stats) => {
      stopSpinner(false);
      if (err) {
        return reject(err);
      }

      if (stats.hasErrors()) {
        return reject(`Build failed with errors.`);
      }

      if (!args.silent) {
        const targetDirShort = path.relative(api.service.context, targetDir);
        log(formatStats(stats, targetDirShort, api));
        if (args.target === 'app' && !isLegacyBuild) {
          if (!args.watch) {
            done(`Build complete. The ${chalk.cyan(targetDirShort)} directory is ready to be deployed.`);
          } else {
            done(`Build complete. Watching for changes...`);
          }
        }
      }

      // test-only signal
      if (process.env.CLI_TEST) {
        console.log('Build complete.');
      }

      resolve();
    });
  });
}

module.exports.defaultModes = {
  build: 'production',
};
