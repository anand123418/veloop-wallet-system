const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { reqCtx } = require("../utils/context");
const schemas = require("../validators/schemas");
const exchangeService = require("../services/exchangeService");

exports.rates = asyncHandler(async (req, res) => {
  res.json({ success: true, rates: await exchangeService.getRates() });
});

exports.exchange = asyncHandler(async (req, res) => {
  const { error, value: idempotencyKey } = schemas.idempotencyKey.validate(req.get("idempotency-key"));
  if (error) throw new AppError("A valid Idempotency-Key header is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");

  const result = await exchangeService.exchange({
    user: req.user,
    ...req.body,
    idempotencyKey,
    ctx: reqCtx(req),
  });
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    message: result.duplicate ? "This exchange has already been processed." : "Exchange completed.",
    exchange: exchangeService.exchangeView(result.exchange),
    wallet: result.wallet,
  });
});
