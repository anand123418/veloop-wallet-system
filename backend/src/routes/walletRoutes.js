const router = require("express").Router();
const c = require("../controllers/walletController");
const admin = require("../controllers/adminController");
const { authenticate, requireAdmin, ownWalletOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const limiters = require("../middleware/rateLimiters");
const s = require("../validators/schemas");

router.use(authenticate);

router.get("/", ownWalletOnly, c.getWallet);
router.get("/transactions", ownWalletOnly, validate(s.pagination, "query"), c.getTransactions);
router.get("/summary", ownWalletOnly, c.getSummary);

// Protected: admin/internal only. Normal users get 403.
router.post("/credit", requireAdmin, limiters.walletMutation, validate(s.adminCredit), admin.credit);
router.post("/debit", requireAdmin, limiters.walletMutation, validate(s.adminDebit), admin.debit);

module.exports = router;
