const router = require("express").Router();
const c = require("../controllers/authController");
const validate = require("../middleware/validate");
const limiters = require("../middleware/rateLimiters");
const s = require("../validators/schemas");

router.post("/register", limiters.auth, validate(s.register), c.register);
router.post("/login", limiters.auth, validate(s.login), c.login);

module.exports = router;
