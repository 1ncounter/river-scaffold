// proxy to joi for option validation
exports.createSchema = fn => fn(require('joi'));

exports.validate = (obj, schema, cb) => {
  require('joi').validate(obj, schema, {}, err => {
    if (err) {
      cb(err.message);
      process.exit(1);
    }
  });
};
