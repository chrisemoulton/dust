import { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { BATCH_RETRIEVE_RESOURCE_TITLE_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { Result } from "@connectors/lib/result";
import { apiError, withLogging } from "@connectors/logger/withlogging";

const GetResourcesTitlesRequestBodySchema = t.type({
  resourceInternalIds: t.array(t.string),
});
type GetResourcesTitlesRequestBody = t.TypeOf<
  typeof GetResourcesTitlesRequestBodySchema
>;

type GetResourcesTitlesResponseBody = {
  resources: {
    internalId: string;
    title: string | null;
  }[];
};

const _getResourcesTitles = async (
  req: Request<
    { connector_id: string },
    GetResourcesTitlesResponseBody,
    GetResourcesTitlesRequestBody
  >,
  res: Response<GetResourcesTitlesResponseBody>
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

  const bodyValidation = GetResourcesTitlesRequestBodySchema.decode(req.body);
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

  const titlesRes: Result<
    Record<string, string | null>,
    Error
  > = await BATCH_RETRIEVE_RESOURCE_TITLE_BY_TYPE[connector.type](
    connector.id,
    resourceInternalIds
  );

  if (titlesRes.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: titlesRes.error.message,
      },
      status_code: 500,
    });
  }

  const titles = titlesRes.value;

  return res.status(200).json({
    resources: resourceInternalIds.map((internalId) => ({
      internalId,
      title: titles[internalId] || null,
    })),
  });
};

export const getResourcesTitlesAPIHandler = withLogging(_getResourcesTitles);
