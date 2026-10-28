const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { reqCtx } = require("../utils/context");
const schemas = require("../validators/schemas");
const miningService = require("../services/miningService");

exports.status = asyncHandler(async (req, res) => {
  res.json({ success: true, mining: await miningService.getStatus(req.user.id) });
});

exports.start = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Mining session started.",
    mining: await miningService.start(req.user),
  });
});

exports.claim = asyncHandler(async (req, res) => {
  const { error, value: idempotencyKey } = schemas.idempotencyKey.validate(req.get("idempotency-key"));
  if (error) throw new AppError("A valid Idempotency-Key header is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");

  const result = await miningService.claim({ user: req.user, idempotencyKey, ctx: reqCtx(req) });
  if (result.sessionCompleted) {
    return res.json({
      success: true,
      duplicate: false,
      message: "Mining session limit reached. Start another session when you are ready.",
      mining: result.mining,
      wallet: result.wallet,
    });
  }
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    message: result.duplicate ? "This mining reward has already been claimed." : `Mining reward claimed: +${result.claim.amount} VEs.`,
    claim: miningService.claimView(result.claim),
    mining: result.mining,
    wallet: result.wallet,
  });
});
