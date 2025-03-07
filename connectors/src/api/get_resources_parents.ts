import { Request, Response } from "express";
import { zip } from "fp-ts/lib/Array";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { RETRIEVE_RESOURCE_PARENTS_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";

const GetResourcesParentsRequestBodySchema = t.type({
  resourceInternalIds: t.array(t.string),
});

export type GetResourcesParentsRequestBody = t.TypeOf<
  typeof GetResourcesParentsRequestBodySchema
>;

type GetResourcesParentsResponseBody = {
  resources: {
    internalId: string;
    parents: string[] | null;
  }[];
};

const _getResourcesParents = async (
  req: Request<
    { connector_id: string },
    GetResourcesParentsResponseBody,
    GetResourcesParentsRequestBody
  >,
  res: Response<GetResourcesParentsResponseBody>
) => {
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

  const bodyValidation = GetResourcesParentsRequestBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }

  const { resourceInternalIds } = bodyValidation.right;

  const parentsGetter = RETRIEVE_RESOURCE_PARENTS_BY_TYPE[connector.type];
  const parentsResults = await Promise.all(
    resourceInternalIds.map((resourceInternalId) =>
      parentsGetter(connector.id, resourceInternalId)
    )
  );
  const resources: { internalId: string; parents: string[] }[] = [];

  for (const [internalId, parentsResult] of zip(
    resourceInternalIds,
    parentsResults
  )) {
    if (parentsResult.isErr()) {
      logger.error(parentsResult.error, "Failed to get resource parents");
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: parentsResult.error.message,
        },
        status_code: 500,
      });
    }

    resources.push({
      internalId,
      parents: parentsResult.value,
    });
  }

  return res.status(200).json({ resources });
};

export const getResourcesParentsAPIHandler = withLogging(_getResourcesParents);
