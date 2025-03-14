import { NextApiRequest, NextApiResponse } from "next";

import { getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Workspace } from "@app/lib/models";
import { internalSubscribeWorkspaceToFreeTestPlan } from "@app/lib/plans/subscription";
import { apiError, withLogging } from "@app/logger/withlogging";
import { WorkspaceType } from "@app/types/user";

export type DowngradeWorkspaceResponseBody = {
  workspace: WorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DowngradeWorkspaceResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (!user.isDustSuperUser) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const { wId } = req.query;
      if (!wId || typeof wId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request query is invalid, expects { workspaceId: string }.",
          },
        });
      }

      const workspace = await Workspace.findOne({
        where: {
          sId: wId,
        },
      });

      if (!workspace) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Could not find the workspace.",
          },
        });
      }

      await internalSubscribeWorkspaceToFreeTestPlan({
        workspaceId: workspace.sId,
      });

      return res.status(200).json({
        workspace: {
          id: workspace.id,
          sId: workspace.sId,
          name: workspace.name,
          allowedDomain: workspace.allowedDomain || null,
          role: "admin",
        },
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
