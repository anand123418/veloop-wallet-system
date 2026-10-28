// Ledger and audit records are append-only. Block updates and deletes at the model level.
module.exports = function immutable(schema, name) {
  const blocked = [
    "updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace",
    "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete",
  ];
  schema.pre(blocked, function () {
    throw new Error(`${name} records are immutable.`);
  });
  schema.pre("save", function (next) {
    if (!this.isNew) return next(new Error(`${name} records are immutable.`));
    next();
  });
};
