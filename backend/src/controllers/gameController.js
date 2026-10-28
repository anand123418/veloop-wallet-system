const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { reqCtx } = require("../utils/context");
const schemas = require("../validators/schemas");
const gameService = require("../services/gameService");
const rpsService = require("../services/rpsService");

function readIdempotencyKey(req) {
  const { error, value } = schemas.idempotencyKey.validate(req.get("idempotency-key"));
  if (error) throw new AppError("A valid Idempotency-Key header is required.", 400, "IDEMPOTENCY_KEY_REQUIRED");
  return value;
}

exports.config = asyncHandler(async (req, res) => {
  const [stonePaperScissors, numberGuess] = await Promise.all([
    rpsService.getStatus(req.user.id),
    gameService.getDailyStatus(req.user.id),
  ]);
  res.json({
    success: true,
    ...gameService.getConfig(),
    numberGuess,
    stonePaperScissors: {
      dailyLimit: rpsService.DAILY_PLAY_LIMIT,
      rewardVes: rpsService.WIN_REWARD_VES,
      ...stonePaperScissors,
    },
  });
});

exports.createChallenge = asyncHandler(async (req, res) => {
  const result = await gameService.createChallenge({ user: req.user, idempotencyKey: readIdempotencyKey(req) });
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    challenge: gameService.challengeView(result.challenge),
    daily: result.daily,
  });
});

exports.guess = asyncHandler(async (req, res) => {
  const result = await gameService.guess({
    user: req.user,
    challengeId: req.params.challengeId,
    guess: req.body.guess,
    idempotencyKey: readIdempotencyKey(req),
    ctx: reqCtx(req),
  });
  res.json({
    success: true,
    duplicate: result.duplicate,
    attempt: result.attempt && {
      guess: result.attempt.guess,
      correct: result.attempt.correct,
      hint: result.attempt.hint,
      attemptsRemaining: result.attempt.attemptsRemaining,
      status: result.attempt.status,
      rewardAmount: result.attempt.rewardAmount,
    },
    challenge: gameService.challengeView(result.challenge),
    wallet: result.wallet,
  });
});

exports.playStonePaperScissors = asyncHandler(async (req, res) => {
  const result = await rpsService.play({
    user: req.user,
    choice: req.body.choice,
    idempotencyKey: readIdempotencyKey(req),
    ctx: reqCtx(req),
  });
  res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    play: rpsService.playView(result.play),
    daily: result.daily,
    wallet: result.wallet,
  });
});
