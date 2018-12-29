const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const readPkg = require('read-pkg');
const Config = require('webpack-chain');
const merge = require('webpack-merge');
const _defaultsDeep = require('lodash/defaultsDeep');

const Plugin = require('./plugin');
const { warn, error } = require('./utils/logger');
const { validate, defaults } = require('./options');

module.exports = class BaseService {
  constructor(context, { plugins, pkg, inlineOptions, useBuiltIn } = {}) {
    this.initialized = false;
    this.context = context;
    this.inlineOptions = inlineOptions;
    this.webpackChainFns = [];
    this.webpackRawConfigFns = [];
    this.devServerConfigFns = [];
    this.commands = {};

    // Folder containing the target package.json for plugins
    this.pkgContext = context;
    // package.json containing the plugins
    this.pkg = this.resolvePkg(pkg);

    this.plugins = this.resolvePlugins(plugins, useBuiltIn);
  }

  init(mode = process.env.CLI_MODE) {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.mode = mode;

    // load mode .env
    if (mode) {
      this.loadEnv(mode);
    }
    // load base .env
    this.loadEnv();

    // load user config
    const userOptions = this.loadUserOptions();

    this.projectOptions = _defaultsDeep(userOptions, defaults());

    // apply plugins.
    this.plugins.forEach(({ id, apply }) => {
      apply(new Plugin(id, this), this.projectOptions);
    });

    // apply webpack configs from project config file
    if (this.projectOptions.chainWebpack) {
      this.webpackChainFns.push(this.projectOptions.chainWebpack);
    }
    if (this.projectOptions.configureWebpack) {
      this.webpackRawConfigFns.push(this.projectOptions.configureWebpack);
    }
  }

  async run(name, args = {}, rawArgv = []) {
    // resolve mode
    // prioritize inline --mode
    // fallback to resolved default modes from plugins or development if --watch is defined
    const mode = args.mode || 'development';

    // load env variables, load user config, apply plugins
    this.init(mode);

    args._ = args._ || [];
    let command = this.commands[name];
    if (!command && name) {
      error(`command "${name}" does not exist.`);
      process.exit(1);
    }
    if (!command || args.help) {
      command = this.commands.help;
    } else {
      args._.shift(); // remove command itself
      rawArgv.shift();
    }
    const { fn } = command;
    return fn(args, rawArgv);
  }

  loadEnv(mode) {
    // by default, NODE_ENV and BABEL_ENV are set to "development" unless mode
    // is production or test. However the value in .env files will take higher
    // priority.
    if (mode) {
      // always set NODE_ENV during tests
      // as that is necessary for tests to not be affected by each other
      const shouldForceDefaultEnv = process.env.CLI_TEST && !process.env.CLI_TEST_TESTING_ENV;
      const defaultNodeEnv = mode === 'production' || mode === 'test' ? mode : 'development';
      if (shouldForceDefaultEnv || process.env.NODE_ENV == null) {
        process.env.NODE_ENV = defaultNodeEnv;
      }
      if (shouldForceDefaultEnv || process.env.BABEL_ENV == null) {
        process.env.BABEL_ENV = defaultNodeEnv;
      }
    }
  }

  resolvePkg(inlinePkg, context = this.context) {
    if (inlinePkg) {
      return inlinePkg;
    } else if (fs.existsSync(path.join(context, 'package.json'))) {
      const pkg = readPkg.sync({ cwd: context });

      return pkg;
    } else {
      return {};
    }
  }

  resolvePlugins(inlinePlugins, useBuiltIn) {
    const idToPlugin = id => ({
      id: id.replace(/^.\//, 'built-in:'),
      apply: require(id),
    });

    let plugins;

    const builtInPlugins = [
      './command/serve',
      // config plugins are order sensitive
      '../config/core',
      '../config/css',
      '../config/dev',
      '../config/prod',
      '../config/app',
    ].map(idToPlugin);

    if (inlinePlugins) {
      plugins = useBuiltIn !== false ? builtInPlugins.concat(inlinePlugins) : inlinePlugins;
    } else {
      plugins = plugins = builtInPlugins;
    }

    return plugins;
  }

  resolveChainableWebpackConfig() {
    const chainableConfig = new Config();
    // apply chains
    this.webpackChainFns.forEach(fn => fn(chainableConfig));
    return chainableConfig;
  }

  resolveWebpackConfig(chainableConfig = this.resolveChainableWebpackConfig()) {
    if (!this.initialized) {
      throw new Error('Service must call init() before calling resolveWebpackConfig().');
    }
    // get raw config
    let config = chainableConfig.toConfig();
    const original = config;
    // apply raw config fns
    this.webpackRawConfigFns.forEach(fn => {
      if (typeof fn === 'function') {
        // function with optional return value
        const res = fn(config);
        if (res) config = merge(config, res);
      } else if (fn) {
        // merge literal values
        config = merge(config, fn);
      }
    });

    // If config is merged by merge-webpack, it discards the __ruleNames
    // information injected by webpack-chain. Restore the info so that
    // vue inspect works properly.
    if (config !== original) {
      cloneRuleNames(config.module && config.module.rules, original.module && original.module.rules);
    }

    // check if the user has manually mutated output.publicPath
    const target = process.env.CLI_BUILD_TARGET;
    if (
      !process.env.CLI_TEST &&
      (target && target !== 'app') &&
      config.output.publicPath !== this.projectOptions.baseUrl
    ) {
      throw new Error(
        `Do not modify webpack output.publicPath directly. ` + `Use the "baseUrl" option in vue.config.js instead.`
      );
    }

    return config;
  }

  loadUserOptions() {
    // vue.config.js
    let fileConfig, pkgConfig, resolved, resolvedFrom;
    const configPath = path.resolve(this.context, './river.config.js');

    if (fs.existsSync(configPath)) {
      try {
        fileConfig = require(configPath);
        if (!fileConfig || typeof fileConfig !== 'object') {
          error(`Error loading ${chalk.bold('river.config.js')}: should export an object.`);
          fileConfig = null;
        }
      } catch (e) {
        error(`Error loading ${chalk.bold('river.config.js')}:`);
        throw e;
      }
    }

    if (fileConfig) {
      if (pkgConfig) {
        warn(`"vue" field in package.json ignored ` + `due to presence of ${chalk.bold('vue.config.js')}.`);
        warn(`You should migrate it into ${chalk.bold('vue.config.js')} ` + `and remove it from package.json.`);
      }
      resolved = fileConfig;
      resolvedFrom = 'river.config.js';
    } else {
      resolved = this.inlineOptions || {};
      resolvedFrom = 'inline options';
    }

    // normalize some options
    ensureSlash(resolved, 'baseUrl');
    if (typeof resolved.baseUrl === 'string') {
      resolved.baseUrl = resolved.baseUrl.replace(/^\.\//, '');
    }
    removeSlash(resolved, 'outputDir');

    // deprecation warning
    // TODO remove in final release
    if (resolved.css && resolved.css.localIdentName) {
      warn(
        `css.localIdentName has been deprecated. ` +
          `All css-loader options (except "modules") are now supported via css.loaderOptions.css.`
      );
    }

    // validate options
    validate(resolved, msg => {
      error(`Invalid options in ${chalk.bold(resolvedFrom)}: ${msg}`);
    });

    return resolved;
  }
};

function ensureSlash(config, key) {
  let val = config[key];
  if (typeof val === 'string') {
    if (!/^https?:/.test(val)) {
      val = val.replace(/^([^/.])/, '/$1');
    }
    config[key] = val.replace(/([^/])$/, '$1/');
  }
}

function removeSlash(config, key) {
  if (typeof config[key] === 'string') {
    config[key] = config[key].replace(/\/$/g, '');
  }
}

function cloneRuleNames(to, from) {
  if (!to || !from) {
    return;
  }
  from.forEach((r, i) => {
    if (to[i]) {
      Object.defineProperty(to[i], '__ruleNames', {
        value: r.__ruleNames,
      });
      cloneRuleNames(to[i].oneOf, r.oneOf);
    }
  });
}
