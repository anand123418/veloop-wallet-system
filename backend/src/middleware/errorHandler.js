const AppError = require("../utils/AppError");

const notFound = (req, res, next) => next(new AppError("Route not found.", 404, "NOT_FOUND"));

// Users only ever see safe messages. Internal details go to the server log.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = 500;
  let message = "Something went wrong. Please try again later.";
  let code = "INTERNAL_ERROR";

  if (err.isAppError) {
    ({ status, message, code } = err);
  } else if (err.code === 11000) {
    status = 409; code = "DUPLICATE";
    message = "This request has already been processed.";
  } else if (err.name === "ValidationError") {
    status = 400; code = "VALIDATION_ERROR"; message = "Invalid data submitted.";
  } else if (err.name === "CastError") {
    status = 400; code = "VALIDATION_ERROR"; message = "Invalid identifier.";
  } else if (err.type === "entity.parse.failed") {
    status = 400; code = "VALIDATION_ERROR"; message = "Malformed JSON body.";
  } else if (err.type === "entity.too.large") {
    status = 413; code = "PAYLOAD_TOO_LARGE"; message = "Request body is too large.";
  }

  if (status === 500 && process.env.NODE_ENV !== "test") console.error("[error]", req.method, req.originalUrl, err);
  res.status(status).json({ success: false, message, code });
};

module.exports = { notFound, errorHandler };
