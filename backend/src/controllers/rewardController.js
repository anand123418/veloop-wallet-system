const asyncHandler = require("../utils/asyncHandler");
const rewardService = require("../services/rewardService");
const adRewardService = require("../services/adRewardService");
const walletService = require("../services/walletService");
const AppError = require("../utils/AppError");
const schemas = require("../validators/schemas");
const { reqCtx } = require("../utils/context");

function readIdempotencyKey(req) {
  const { error, value } = schemas.idempotencyKey.validate(req.get("idempotency-key"));
  if (error) throw new AppError("A valid Idempotency-Key header is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");
  return value;
}

exports.dailyStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await rewardService.getDailyStatus(req.user.id)) });
});

exports.claimDaily = asyncHandler(async (req, res) => {
  const result = await rewardService.claimDaily(req.user.id);
  res.status(201).json({
    success: true,
    message: `Daily reward claimed: +${result.amount} VEs.`,
    amount: result.amount,
    nextClaimAt: result.nextClaimAt,
    wallet: result.wallet,
    transaction: walletService.txView(result.transaction),
  });
});

exports.adStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await adRewardService.getStatus(req.user.id)) });
});

exports.startAd = asyncHandler(async (req, res) => {
  const result = await adRewardService.start({
    user: req.user,
    idempotencyKey: readIdempotencyKey(req),
  });
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    session: adRewardService.sessionView(result.session),
    ...result.status,
  });
});

exports.claimAd = asyncHandler(async (req, res) => {
  const result = await adRewardService.claim({
    user: req.user,
    sessionId: req.params.sessionId,
    idempotencyKey: readIdempotencyKey(req),
    ctx: reqCtx(req),
  });
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    ...result.status,
    message: `Ad reward claimed: +${result.session.amount} VEs.`,
    amount: result.session.amount,
    session: adRewardService.sessionView(result.session),
    wallet: result.wallet,
  });
});
