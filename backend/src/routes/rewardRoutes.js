const router = require("express").Router();
const c = require("../controllers/rewardController");
const { authenticate } = require("../middleware/auth");
const limiters = require("../middleware/rateLimiters");

router.use(authenticate);
router.get("/daily", c.dailyStatus);
router.post("/daily/claim", limiters.walletMutation, c.claimDaily);
router.get("/ad", c.adStatus);
router.post("/ad/start", limiters.walletMutation, c.startAd);
router.post("/ad/:sessionId/claim", limiters.walletMutation, c.claimAd);

module.exports = router;
