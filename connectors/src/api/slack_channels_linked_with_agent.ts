import { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { Op } from "sequelize";

import { APIErrorWithStatusCode } from "@connectors/lib/error";
import { sequelize_conn, SlackChannel } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";

const PatchSlackChannelsLinkedWithAgentReqBodySchema = t.type({
  agent_configuration_id: t.string,
  slack_channel_ids: t.array(t.string),
  connector_id: t.string,
});

type PatchSlackChannelsLinkedWithAgentReqBody = t.TypeOf<
  typeof PatchSlackChannelsLinkedWithAgentReqBodySchema
>;

type PatchSlackChannelsLinkedWithAgentResBody =
  | { success: true }
  | APIErrorWithStatusCode;

const _patchSlackChannelsLinkedWithAgentHandler = async (
  req: Request<
    Record<string, string>,
    PatchSlackChannelsLinkedWithAgentResBody,
    PatchSlackChannelsLinkedWithAgentReqBody
  >,
  res: Response<PatchSlackChannelsLinkedWithAgentResBody>
) => {
  const bodyValidation = PatchSlackChannelsLinkedWithAgentReqBodySchema.decode(
    req.body
  );

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

  const {
    connector_id: connectorId,
    agent_configuration_id: agentConfigurationId,
    slack_channel_ids: slackChannelIds,
  } = bodyValidation.right;

  const slackChannels = await SlackChannel.findAll({
    where: {
      slackChannelId: slackChannelIds,
      connectorId,
    },
  });

  const foundSlackChannelIds = new Set(
    slackChannels.map((c) => c.slackChannelId)
  );

  const missingSlackChannelIds = Array.from(
    new Set(slackChannelIds.filter((id) => !foundSlackChannelIds.has(id)))
  );

  if (missingSlackChannelIds.length) {
    return apiError(req, res, {
      api_error: {
        type: "not_found",
        message: `Slack channel(s) not found: ${missingSlackChannelIds.join(
          ", "
        )}`,
      },
      status_code: 404,
    });
  }

  await sequelize_conn.transaction(async (t) => {
    await SlackChannel.update(
      { agentConfigurationId: null },
      {
        where: {
          connectorId,
          agentConfigurationId,
        },
        transaction: t,
      }
    );
    await Promise.all(
      slackChannelIds.map((slackChannelId) =>
        SlackChannel.update(
          { agentConfigurationId },
          { where: { connectorId, slackChannelId }, transaction: t }
        )
      )
    );
  });

  res.status(200).json({
    success: true,
  });
};

export const patchSlackChannelsLinkedWithAgentHandler = withLogging(
  _patchSlackChannelsLinkedWithAgentHandler
);

type GetSlackChannelsLinkedWithAgentResBody =
  | {
      slackChannels: {
        slackChannelId: string;
        slackChannelName: string;
        agentConfigurationId: string;
      }[];
    }
  | APIErrorWithStatusCode;

const _getSlackChannelsLinkedWithAgentHandler = async (
  req: Request<
    Record<string, string>,
    { slackChannelIds: string[] } | APIErrorWithStatusCode,
    undefined
  >,
  res: Response<GetSlackChannelsLinkedWithAgentResBody>
) => {
  const { connector_id: connectorId } = req.query;

  if (!connectorId || typeof connectorId !== "string") {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Missing required parameters: connector_id`,
      },
      status_code: 400,
    });
  }

  const slackChannels = await SlackChannel.findAll({
    where: {
      connectorId,
      agentConfigurationId: {
        [Op.not]: null,
      },
    },
  });

  res.status(200).json({
    slackChannels: slackChannels.map((c) => ({
      slackChannelId: c.slackChannelId,
      slackChannelName: c.slackChannelName,
      // We know that agentConfigurationId is not null because of the where clause above
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      agentConfigurationId: c.agentConfigurationId!,
    })),
  });
};

export const getSlackChannelsLinkedWithAgentHandler = withLogging(
  _getSlackChannelsLinkedWithAgentHandler
);
