const crypto = require("crypto");
exports.newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
