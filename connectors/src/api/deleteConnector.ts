import { Request, Response } from "express";

import {
  CLEAN_CONNECTOR_BY_TYPE,
  STOP_CONNECTOR_BY_TYPE,
} from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorDeleteReqBody = {
  dataSourceName: string;
  workspaceId: string;
};

type ConnectorDeleteResBody = { success: true } | ConnectorsAPIErrorResponse;

const _deleteConnectorAPIHandler = async (
  req: Request<
    { connector_id: string },
    ConnectorDeleteResBody,
    ConnectorDeleteReqBody
  >,
  res: Response<ConnectorDeleteResBody>
) => {
  try {
    const connector = await Connector.findByPk(req.params.connector_id);
    if (!connector) {
      return apiError(req, res, {
        api_error: {
          type: "connector_not_found",
          message: "Connector not found",
        },
        status_code: 404,
      });
    }

    const connectorStopper = STOP_CONNECTOR_BY_TYPE[connector.type];

    const stopRes = await connectorStopper(connector.id.toString());

    if (stopRes.isErr()) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: stopRes.error.message,
        },
        status_code: 500,
      });
    }

    if (!connector) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: "Could not find the connector",
        },
        status_code: 500,
      });
    }

    const connectorCleaner = CLEAN_CONNECTOR_BY_TYPE[connector.type];
    const cleanRes = await connectorCleaner(connector.id.toString());
    if (cleanRes.isErr()) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: cleanRes.error.message,
        },
        status_code: 500,
      });
    }

    await connector.destroy();

    return res.json({
      success: true,
    });
  } catch (e) {
    logger.error(errorFromAny(e), "Failed to delete the connector");
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: "Could not delete the connector",
      },
      status_code: 500,
    });
  }
};

export const deleteConnectorAPIHandler = withLogging(
  _deleteConnectorAPIHandler
);
