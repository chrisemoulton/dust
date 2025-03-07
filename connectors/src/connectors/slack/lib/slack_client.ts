import {
  CodedError,
  ErrorCode,
  WebAPIHTTPError,
  WebClient,
} from "@slack/web-api";

import { WorkflowError } from "@connectors/lib/error";
import { Connector, ModelId } from "@connectors/lib/models";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
const { NANGO_SLACK_CONNECTOR_ID } = process.env;

// Timeout in ms for all network requests;
const SLACK_NETWORK_TIMEOUT_MS = 30000;

export async function getSlackClient(connectorId: ModelId): Promise<WebClient>;
export async function getSlackClient(
  slackAccessToken: string
): Promise<WebClient>;
export async function getSlackClient(
  connectorIdOrAccessToken: string | ModelId
): Promise<WebClient> {
  let slackAccessToken: string | undefined = undefined;
  if (typeof connectorIdOrAccessToken === "number") {
    const connector = await Connector.findByPk(connectorIdOrAccessToken);
    if (!connector) {
      throw new Error(`Could not find connector ${connectorIdOrAccessToken}`);
    }
    slackAccessToken = await getAccessToken(connector.connectionId);
  } else {
    slackAccessToken = connectorIdOrAccessToken;
  }
  const slackClient = new WebClient(slackAccessToken, {
    timeout: SLACK_NETWORK_TIMEOUT_MS,
    retryConfig: {
      retries: 1,
      factor: 1,
    },
  });

  const handler: ProxyHandler<WebClient> = {
    get: function (target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (["function", "object"].indexOf(typeof value) > -1) {
        return new Proxy(value, handler);
      }

      return Reflect.get(target, prop, receiver);
    },
    apply: async function (target, thisArg, argumentsList) {
      try {
        // @ts-expect-error can't get typescript to be happy with this, but it works.
        return await Reflect.apply(target, thisArg, argumentsList);
      } catch (e) {
        const slackError = e as CodedError;
        if (slackError.code === ErrorCode.HTTPError) {
          const httpError = slackError as WebAPIHTTPError;
          if (httpError.statusCode === 503) {
            const workflowError: WorkflowError = {
              type: "upstream_is_down_activity_error",
              message: `Slack is down: ${httpError.message}`,
              __is_dust_error: true,
            };
            throw workflowError;
          }
        }

        throw e;
      }
    },
  };

  const proxied = new Proxy(slackClient, handler);

  return proxied;
}

async function getAccessToken(nangoConnectionId: string): Promise<string> {
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
  }
  return getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_SLACK_CONNECTOR_ID,
    useCache: true,
  });
}
