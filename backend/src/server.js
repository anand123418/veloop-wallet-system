const env = require("./config/env");
const { connectDb } = require("./config/db");
const app = require("./app");

(async () => {
  try {
    await connectDb(env.mongoUri);
    app.listen(env.port, () => console.log(`API running on port ${env.port}`));
  } catch (err) {
    console.error("Failed to start:", err.message);
    process.exit(1);
  }
})();
