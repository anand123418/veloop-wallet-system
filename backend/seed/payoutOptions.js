// Payout configuration lives in the database, not in the frontend.
// To change a price (e.g. Rs 100 = 19,500 VEs) update the row (or call
// PATCH /api/admin/payout-options/:optionId). No frontend rebuild is needed.
//
// UPI values come from the task brief. The brief says the LIVE VELoop Payout
// page wins if it differs, so compare and edit this file before final submission.
// Amazon / Google Play values are DEMO values (marked in metadata) until checked against the live page.
const PayoutMethod = require("../src/models/PayoutMethod");
const PayoutOption = require("../src/models/PayoutOption");

const TABLE = [
  [10, 2400], [25, 5800], [50, 10000], [100, 19500],
  [150, 28500], [300, 52500], [500, 80500], [1000, 150000],
];

const UPI_ID = {
  name: "upiId", label: "UPI ID", type: "text", placeholder: "name@bank",
  pattern: "^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$",
  errorMessage: "Enter a valid UPI ID, for example name@bank.",
};
const EMAIL = {
  name: "email", label: "Email to receive the gift card", type: "email", placeholder: "you@example.com",
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
  errorMessage: "Enter a valid email address.",
};

const methods = [
  { method: "upi", name: "UPI", fields: [UPI_ID], sortOrder: 1, table: TABLE, demo: false },
  { method: "amazon", name: "Amazon Gift Card", fields: [EMAIL], sortOrder: 2, table: TABLE.slice(0, 5), demo: true },
  { method: "google_play", name: "Google Play Gift Card", fields: [EMAIL], sortOrder: 3, table: TABLE.slice(0, 5), demo: true },
];

async function seedPayoutConfig() {
  for (const m of methods) {
    await PayoutMethod.updateOne(
      { method: m.method },
      { $set: { name: m.name, fields: m.fields, sortOrder: m.sortOrder }, $setOnInsert: { active: true } },
      { upsert: true }
    );
    for (const [i, [value, ves]] of m.table.entries()) {
      await PayoutOption.updateOne(
        { optionId: `${m.method}_${value}` },
        {
          $set: { method: m.method, currency: "ves", payoutValue: value, requiredAmount: ves, payoutCurrency: "INR", sortOrder: i + 1, metadata: { demoValues: m.demo } },
          $setOnInsert: { active: true, eligibility: { minAccountAgeDays: 0 } },
        },
        { upsert: true }
      );
    }
  }
}

module.exports = { seedPayoutConfig };
