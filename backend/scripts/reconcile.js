// npm run reconcile  ->  checks wallet balance == credits - debits for every user.
require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../src/config/env");
const { connectDb } = require("../src/config/db");
const { reconcileAll } = require("../src/services/reconciliationService");

(async () => {
  await connectDb(env.mongoUri);
  const report = await reconcileAll();
  console.log(JSON.stringify(report, null, 2));
  console.log(report.ok ? `\nOK: ${report.checked} wallet(s) match their ledger.` : "\nMISMATCH FOUND. Investigate the entries above.");
  await mongoose.disconnect();
  process.exit(report.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
