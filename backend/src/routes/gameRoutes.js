const router = require("express").Router();
const c = require("../controllers/gameController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const limiters = require("../middleware/rateLimiters");
const s = require("../validators/schemas");

router.use(authenticate);
router.get("/config", c.config);
router.post("/challenges", limiters.walletMutation, c.createChallenge);
router.post("/challenges/:challengeId/guess", limiters.walletMutation, validate(s.gameGuess), c.guess);
router.post("/stone-paper-scissors/play", limiters.walletMutation, validate(s.rpsPlay), c.playStonePaperScissors);

module.exports = router;
