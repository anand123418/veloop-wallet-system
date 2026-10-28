const router = require("express").Router();
const c = require("../controllers/withdrawalController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const limiters = require("../middleware/rateLimiters");
const s = require("../validators/schemas");

router.use(authenticate);
router.post("/", limiters.withdrawal, validate(s.createWithdrawal), c.create);
router.get("/", validate(s.pagination, "query"), c.list);
router.get("/:id", c.get);
router.post("/:id/cancel", limiters.withdrawal, c.cancel);

module.exports = router;
