const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoSanitize = require("express-mongo-sanitize");
const env = require("./config/env");
const limiters = require("./middleware/rateLimiters");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.set("trust proxy", env.trustProxyHops);
app.use(helmet());
app.use(cors({ origin: env.clientUrls }));
app.use(express.json({ limit: "10kb" }));
app.use(mongoSanitize()); // strips $ and . operators (NoSQL injection)

app.get("/health", (req, res) => res.json({ success: true, status: "ok" }));

app.use("/api", limiters.general);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/wallet", require("./routes/walletRoutes"));
app.use("/api/payout", require("./routes/payoutRoutes"));
app.use("/api/rewards", require("./routes/rewardRoutes"));
app.use("/api/exchanges", require("./routes/exchangeRoutes"));
app.use("/api/referrals", require("./routes/referralRoutes"));
app.use("/api/spin", require("./routes/spinRoutes"));
app.use("/api/mining", require("./routes/miningRoutes"));
app.use("/api/games", require("./routes/gameRoutes"));
app.use("/api/withdrawals", require("./routes/withdrawalRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
