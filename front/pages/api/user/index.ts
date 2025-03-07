import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { updateUserFullName } from "@app/lib/api/user";
import { getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostUserMetadataResponseBody = {
  success: boolean;
};

const PatchUserBodySchema = t.type({
  firstName: t.string,
  lastName: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostUserMetadataResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH":
      const bodyValidation = PatchUserBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const result = await updateUserFullName({
        user: user,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
      });

      if (!result) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "internal_server_error",
            message: "Couldn't update the user.",
          },
        });
      }

      res.status(200).json({
        success: true,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withLogging(handler);
