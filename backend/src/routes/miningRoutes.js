const router = require("express").Router();
const c = require("../controllers/miningController");
const { authenticate } = require("../middleware/auth");
const limiters = require("../middleware/rateLimiters");

router.use(authenticate);
router.get("/status", c.status);
router.post("/start", limiters.walletMutation, c.start);
router.post("/claim", limiters.walletMutation, c.claim);

module.exports = router;
