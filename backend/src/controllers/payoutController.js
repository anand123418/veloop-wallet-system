const asyncHandler = require("../utils/asyncHandler");
const payoutService = require("../services/payoutService");

exports.getMethods = asyncHandler(async (req, res) => {
  res.json({ success: true, methods: await payoutService.listMethods() });
});

exports.getOptions = asyncHandler(async (req, res) => {
  const options = await payoutService.listOptions(req.params.method, req.user);
  res.json({ success: true, options });
});
