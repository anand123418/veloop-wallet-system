const AppError = require("../utils/AppError");

const validate = (schema, source = "body") => (req, res, next) => {
  const { value, error } = schema.validate(req[source] ?? {}, { abortEarly: true, stripUnknown: true, convert: true });
  if (error) {
    return next(new AppError(error.details[0].message.replace(/"/g, ""), 400, "VALIDATION_ERROR"));
  }
  req[source] = value;
  next();
};

module.exports = validate;
