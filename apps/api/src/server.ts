import { createApp } from "./index.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();
app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT }, "API listening");
});
