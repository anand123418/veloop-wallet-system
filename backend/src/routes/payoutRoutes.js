const router = require("express").Router();
const c = require("../controllers/payoutController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);
router.get("/methods", c.getMethods);
router.get("/options/:method", c.getOptions);

module.exports = router;
