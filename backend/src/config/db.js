const mongoose = require("mongoose");

async function connectDb(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  // Wallet operations use multi-document transactions, which need a replica set.
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") {
    console.warn("WARNING: MongoDB is not a replica set. Transactions will fail. Use MongoDB Atlas.");
  }
  // Make sure collections and unique indexes exist before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

module.exports = { connectDb };
