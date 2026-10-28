const router = require("express").Router();
const c = require("../controllers/spinController");
const { authenticate } = require("../middleware/auth");
const limiters = require("../middleware/rateLimiters");

router.use(authenticate);
router.get("/prizes", c.prizes);
router.post("/play", limiters.walletMutation, c.play);

module.exports = router;
