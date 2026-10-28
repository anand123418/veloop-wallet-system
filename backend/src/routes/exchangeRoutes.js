const router = require("express").Router();
const c = require("../controllers/exchangeController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const limiters = require("../middleware/rateLimiters");
const s = require("../validators/schemas");

router.use(authenticate);
router.get("/rates", c.rates);
router.post("/", limiters.walletMutation, validate(s.exchange), c.exchange);

module.exports = router;
