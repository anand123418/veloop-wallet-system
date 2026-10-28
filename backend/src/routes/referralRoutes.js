const router = require("express").Router();
const c = require("../controllers/referralController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);
router.get("/", c.summary);

module.exports = router;
