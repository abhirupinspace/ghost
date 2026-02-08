import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { intentRoutes } from "./routes/intents";
import { marketRoutes } from "./routes/market";
import { loanRoutes } from "./routes/loans";
import { userRoutes } from "./routes/user";
import { triggerRoutes } from "./routes/trigger";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

app.route("/", intentRoutes);
app.route("/", marketRoutes);
app.route("/", loanRoutes);
app.route("/", userRoutes);
app.route("/", triggerRoutes);

export default app;
