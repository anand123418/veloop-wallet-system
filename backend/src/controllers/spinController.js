const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { reqCtx } = require("../utils/context");
const schemas = require("../validators/schemas");
const spinService = require("../services/spinService");

exports.prizes = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await spinService.getPrizes()) });
});

exports.play = asyncHandler(async (req, res) => {
  const { error, value: idempotencyKey } = schemas.idempotencyKey.validate(req.get("idempotency-key"));
  if (error) throw new AppError("A valid Idempotency-Key header is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");

  const result = await spinService.play({ user: req.user, idempotencyKey, ctx: reqCtx(req) });
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    message: result.duplicate ? "This spin has already been played." : "Spin completed.",
    spin: spinService.spinView(result.spin),
    wallet: result.wallet,
  });
});
