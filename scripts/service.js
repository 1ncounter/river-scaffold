const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const BaseService = require('./base');

function fileExistsWithCaseSync(filepath) {
  const { base, dir, root } = path.parse(filepath);

  if (dir === root || dir === '.') {
    return true;
  }

  try {
    const filenames = fs.readdirSync(dir);
    if (!filenames.includes(base)) {
      return false;
    }
  } catch (e) {
    // dir does not exist
    return false;
  }

  return fileExistsWithCaseSync(dir);
}

const findExisting = (context, files) => {
  for (const file of files) {
    if (fileExistsWithCaseSync(path.join(context, file))) {
      return file;
    }
  }
};

function resolveEntry(entry) {
  const context = process.cwd();

  entry = entry || findExisting(context, ['src/main.ts', 'src/index.ts']);

  if (!entry) {
    console.log(chalk.red(`Failed to locate entry file in ${chalk.yellow(context)}.`));
    console.log(chalk.red(`Valid entry file should be one of: main.ts, index.ts.`));
    process.exit(1);
  }

  if (!fs.existsSync(path.join(context, entry))) {
    console.log(chalk.red(`Entry file ${chalk.yellow(entry)} does not exist.`));
    process.exit(1);
  }

  return {
    context,
    entry,
  };
}

function createService(context, entry) {
  return new BaseService(context, {
    projectOptions: {
      compiler: true,
      lintOnSave: true,
    },
    plugins: [],
  });
}

exports.serve = (_entry, args) => {
  const { context, entry } = resolveEntry(_entry);
  createService(context, entry).run('serve', args);
};

exports.build = (_entry, args) => {
  const { context, entry } = resolveEntry(_entry);
  createService(context, entry).run('build', args);
};
