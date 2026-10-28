const PayoutMethod = require("../models/PayoutMethod");
const PayoutOption = require("../models/PayoutOption");
const AppError = require("../utils/AppError");

const DAY_MS = 24 * 60 * 60 * 1000;

function isEligible(option, user) {
  const minDays = option.eligibility?.minAccountAgeDays || 0;
  if (!minDays) return true;
  const ageDays = (Date.now() - new Date(user.createdAt).getTime()) / DAY_MS;
  return ageDays >= minDays;
}

const methodView = (m) => ({ method: m.method, name: m.name, fields: m.fields });

const optionView = (o, user) => ({
  optionId: o.optionId,
  method: o.method,
  currency: o.currency,
  requiredAmount: o.requiredAmount,
  payoutValue: o.payoutValue,
  payoutCurrency: o.payoutCurrency,
  active: o.active,
  eligible: isEligible(o, user),
});

async function getActiveMethod(method) {
  const m = await PayoutMethod.findOne({ method, active: true }).lean();
  if (!m) throw new AppError("This payout method is currently unavailable.", 400, "METHOD_UNAVAILABLE");
  return m;
}

async function listMethods() {
  const methods = await PayoutMethod.find({ active: true }).sort({ sortOrder: 1 }).lean();
  return methods.map(methodView);
}

async function listOptions(method, user) {
  await getActiveMethod(method);
  const options = await PayoutOption.find({ method, active: true }).sort({ sortOrder: 1 }).lean();
  return options.map((o) => optionView(o, user));
}

// Looks up the real price/payout on the server. The client only ever sends ids.
async function resolveOption(method, optionId, user) {
  const methodDoc = await getActiveMethod(method);
  const option = await PayoutOption.findOne({ optionId, method }).lean();
  if (!option || !option.active) {
    throw new AppError("Selected payout option is unavailable.", 400, "INVALID_OPTION");
  }
  if (!isEligible(option, user)) {
    throw new AppError("You are not eligible for this payout option yet.", 403, "NOT_ELIGIBLE");
  }
  return { methodDoc, option };
}

// Accepts only the fields the method defines, trims them, and checks the pattern.
function validateDetails(methodDoc, details = {}) {
  const cleaned = {};
  for (const field of methodDoc.fields) {
    const raw = details[field.name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) throw new AppError(`${field.label} is required.`, 400, "INVALID_DETAILS");
    if (value.length > 100) throw new AppError(`${field.label} is too long.`, 400, "INVALID_DETAILS");
    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      throw new AppError(field.errorMessage || `${field.label} is not valid.`, 400, "INVALID_DETAILS");
    }
    cleaned[field.name] = value;
  }
  return cleaned;
}

module.exports = { listMethods, listOptions, resolveOption, validateDetails, optionView };
