import bodyParser from "body-parser";
import express from "express";

import {
  getBotEnabledAPIHandler,
  setBotEnabledAPIHandler,
} from "@connectors/api/bot_enabled";
import { createConnectorAPIHandler } from "@connectors/api/create_connector";
import { deleteConnectorAPIHandler } from "@connectors/api/delete_connector";
import { getConnectorAPIHandler } from "@connectors/api/get_connector";
import { getConnectorPermissionsAPIHandler } from "@connectors/api/get_connector_permissions";
import { getResourcesParentsAPIHandler } from "@connectors/api/get_resources_parents";
import { getResourcesTitlesAPIHandler } from "@connectors/api/get_resources_titles";
import { resumeConnectorAPIHandler } from "@connectors/api/resume_connector";
import { setConnectorPermissionsAPIHandler } from "@connectors/api/set_connector_permissions";
import {
  getSlackChannelsLinkedWithAgentHandler,
  patchSlackChannelsLinkedWithAgentHandler,
} from "@connectors/api/slack_channels_linked_with_agent";
import { stopConnectorAPIHandler } from "@connectors/api/stop_connector";
import { syncConnectorAPIHandler } from "@connectors/api/sync_connector";
import { getConnectorUpdateAPIHandler } from "@connectors/api/update_connector";
import { webhookGithubAPIHandler } from "@connectors/api/webhooks/webhook_github";
import { webhookGoogleDriveAPIHandler } from "@connectors/api/webhooks/webhook_google_drive";
import { webhookSlackAPIHandler } from "@connectors/api/webhooks/webhook_slack";
import logger from "@connectors/logger/logger";
import { authMiddleware } from "@connectors/middleware/auth";

export function startServer(port: number) {
  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ promise, reason }, "Unhandled Rejection");
  });

  process.on("uncaughtException", (error) => {
    logger.error({ error }, "Uncaught Exception");
  });

  const app = express();

  // for health check -- doesn't go through auth middleware
  app.get("/", (_req, res) => {
    res.status(200).send("OK");
  });

  app.use(
    bodyParser.json({
      verify: (req, _res, buf) => {
        // @ts-expect-error -- rawBody is not defined on Request
        // but we need it to validate webhooks signatures
        req.rawBody = buf;
      },
    })
  );

  app.use(authMiddleware);

  app.post("/connectors/create/:connector_provider", createConnectorAPIHandler);
  app.post("/connectors/update/:connector_id/", getConnectorUpdateAPIHandler);
  app.post("/connectors/stop/:connector_id", stopConnectorAPIHandler);
  app.post("/connectors/resume/:connector_id", resumeConnectorAPIHandler);
  app.delete("/connectors/delete/:connector_id", deleteConnectorAPIHandler);
  app.get("/connectors/:connector_id", getConnectorAPIHandler);
  app.get("/connectors/:connector_id/bot_enabled", getBotEnabledAPIHandler);
  app.post("/connectors/:connector_id/bot_enabled", setBotEnabledAPIHandler);
  app.post("/connectors/sync/:connector_id", syncConnectorAPIHandler);
  app.get(
    "/connectors/:connector_id/permissions",
    getConnectorPermissionsAPIHandler
  );
  app.post(
    // must be POST because of body
    "/connectors/:connector_id/resources/parents",
    getResourcesParentsAPIHandler
  );
  app.post(
    // must be POST because of body
    "/connectors/:connector_id/resources/titles",
    getResourcesTitlesAPIHandler
  );
  app.post(
    "/connectors/:connector_id/permissions",
    setConnectorPermissionsAPIHandler
  );

  app.patch(
    "/slack/channels/linked_with_agent",
    patchSlackChannelsLinkedWithAgentHandler
  );
  app.get(
    "/slack/channels/linked_with_agent",
    getSlackChannelsLinkedWithAgentHandler
  );

  app.post("/webhooks/:webhook_secret/slack", webhookSlackAPIHandler);
  app.post(
    "/webhooks/:webhook_secret/google_drive",
    webhookGoogleDriveAPIHandler
  );
  app.post(
    "/webhooks/:webhooks_secret/github",
    bodyParser.raw({ type: "application/json" }),
    webhookGithubAPIHandler
  );

  const server = app.listen(port, () => {
    logger.info(`Connectors API listening on port ${port}`);
  });

  const gracefulShutdown = () => {
    logger.info("[GRACEFUL] Received kill signal, shutting down gracefully.");
    server.close(() => {
      logger.info("[GRACEFUL] Closed out remaining connections.");
      process.exit();
    });

    setTimeout(() => {
      logger.error(
        "[GRACEFUL] Could not close connections within 30s, forcefully shutting down"
      );
      process.exit(1);
    }, 30 * 1000);
  };

  // listen for TERM signal .e.g. kill
  process.on("SIGTERM", gracefulShutdown);
  // listen for INT signal e.g. Ctrl-C
  process.on("SIGINT", gracefulShutdown);
}
