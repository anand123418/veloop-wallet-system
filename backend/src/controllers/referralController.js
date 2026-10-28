const asyncHandler = require("../utils/asyncHandler");
const referralService = require("../services/referralService");

exports.summary = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await referralService.getSummary(req.user.id)) });
});
