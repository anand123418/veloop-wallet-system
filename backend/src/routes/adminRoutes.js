const router = require("express").Router();
const c = require("../controllers/adminController");
const { authenticate, requireAdmin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const limiters = require("../middleware/rateLimiters");
const s = require("../validators/schemas");

router.use(authenticate, requireAdmin, limiters.walletMutation);

router.get("/withdrawals", validate(s.adminList, "query"), c.listWithdrawals);
router.patch("/withdrawals/:id/processing", validate(s.review), c.markProcessing);
router.patch("/withdrawals/:id/approve", validate(s.review), c.approve);
router.patch("/withdrawals/:id/reject", validate(s.reject), c.reject);

router.patch("/payout-options/:optionId", validate(s.payoutOptionUpdate), c.updatePayoutOption);

router.get("/audit-logs", validate(s.adminList, "query"), c.auditLogs);
router.get("/reconcile/:userId", validate(s.userIdParam, "params"), c.reconcileUser);

module.exports = router;
