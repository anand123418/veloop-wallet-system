const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { reqCtx } = require("../utils/context");
const schemas = require("../validators/schemas");
const withdrawalService = require("../services/withdrawalService");
const walletService = require("../services/walletService");

exports.create = asyncHandler(async (req, res) => {
  const { error, value: key } = schemas.idempotencyKey.validate(req.get("idempotency-key"));
  if (error) throw new AppError("A valid Idempotency-Key header is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");

  const { method, optionId, payoutDetails } = req.body;
  const result = await withdrawalService.createWithdrawal({
    user: req.user, method, optionId, payoutDetails, idempotencyKey: key, ctx: reqCtx(req),
  });

  const wallet = result.wallet || (await walletService.getWallet(req.user.id));
  const withdrawal = withdrawalService.userView(result.withdrawal);
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    message: result.duplicate
      ? "This withdrawal request has already been submitted."
      : "Withdrawal submitted successfully.",
    withdrawal,
    wallet,
  });
});

exports.list = asyncHandler(async (req, res) => {
  const data = await withdrawalService.listForUser(req.user.id, req.query);
  res.json({ success: true, ...data });
});

exports.get = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.getForUser(req.user.id, req.params.id);
  res.json({ success: true, withdrawal });
});

exports.cancel = asyncHandler(async (req, res) => {
  const w = await withdrawalService.transition({
    withdrawalId: req.params.id, to: "CANCELLED", actor: req.user, ownerOnly: true, ctx: reqCtx(req),
  });
  res.json({ success: true, message: "Withdrawal cancelled and VEs returned.", withdrawal: withdrawalService.userView(w) });
});
