import {
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/slack/temporal/activities";
import { ModelId } from "@connectors/lib/models";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { getWeekEnd, getWeekStart } from "../lib/utils";
import {
  botJoinedChanelSignal,
  botJoinedChanelSignalInput,
  newWebhookSignal,
} from "./signals";

const {
  getChannel,
  getChannels,
  syncThread,
  syncNonThreaded,
  syncChannel,
  fetchUsers,
  saveSuccessSyncActivity,
  reportInitialSyncProgressActivity,
  getChannelsToGarbageCollect,
  joinChannelAct,
  deleteChannel,
  deleteChannelsFromConnectorDb,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

/**
 * - Concurrency model:
 * One child workflow per Slack channel is triggered
 * For one channel:
 *  We fetch messages by batch of 100.
 *   We trigger 2 sync activities per batch of 100:
 *    One for all threaded messages
 *     Inside, we have one promise per thread
 *    One for all non threaded messages
 *     Inside, we have one promise per week
 *    Promises are sent and awaited by batch of activities.MAX_CONCURRENCY_LEVEL
 */
export async function workspaceFullSync(
  connectorId: ModelId,
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string,
  fromTs: number | null
): Promise<void> {
  await fetchUsers(connectorId);
  const channels = await getChannels(connectorId, true);
  let i = 0;
  for (const channel of channels) {
    if (!channel.id || !channel.name) {
      throw new Error(`Channel ${channel.name} has no id`);
    }
    await executeChild(syncOneChannel, {
      workflowId: syncOneChanneWorkflowlId(connectorId, channel.id),
      args: [connectorId, channel.id, channel.name, false, fromTs],
      memo: workflowInfo().memo,
    });
    i++;
    const percentSync = Math.round((i / channels.length) * 100);
    await reportInitialSyncProgressActivity(connectorId, `${percentSync}%`);
  }
  await saveSuccessSyncActivity(connectorId);
  console.log(`Workspace sync done for connector ${connectorId}`);
}

export async function syncOneChannel(
  connectorId: ModelId,
  channelId: string,
  channelName: string,
  updateSyncStatus: boolean,
  fromTs: number | null
) {
  console.log(`Syncing channel ${channelName} (${channelId})`);
  await joinChannelAct(connectorId, channelId);

  let messagesCursor: string | undefined = undefined;
  let weeksSynced: Record<number, boolean> = {};

  do {
    const syncChannelRes = await syncChannel(
      channelId,
      channelName,
      connectorId,
      fromTs,
      weeksSynced,
      messagesCursor
    );
    if (syncChannelRes) {
      messagesCursor = syncChannelRes.nextCursor;
      weeksSynced = syncChannelRes.weeksSynced;
    }
  } while (messagesCursor);

  console.log(`Syncing channel ${channelName} (${channelId}) done`);
  if (updateSyncStatus) {
    await saveSuccessSyncActivity(connectorId);
  }
}

export async function syncOneThreadDebounced(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    console.log("Got a new webhook ");
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount++;
      continue;
    }
    const channel = await getChannel(connectorId, channelId);
    if (!channel.name) {
      throw new Error(`Could not find channel name for channel ${channelId}`);
    }

    console.log(`Talked to slack after debouncing ${debounceCount} time(s)`);
    await syncThread(channelId, channel.name, threadTs, connectorId);
    await saveSuccessSyncActivity(connectorId);
  }
  // /!\ Any signal received outside of the while loop will be lost, so don't make any async
  // call here, which will allow the signal handler to be executed by the nodejs event loop. /!\
}

export async function syncOneMessageDebounced(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    console.log("Got a new webhook ");
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount++;
      console.log("Debouncing, sleep 10 secs");
      continue;
    }
    console.log(`Talked to slack after debouncing ${debounceCount} time(s)`);

    const channel = await getChannel(connectorId, channelId);
    if (!channel.name) {
      throw new Error(`Could not find channel name for channel ${channelId}`);
    }
    const messageTs = parseInt(threadTs) * 1000;
    const startTsMs = getWeekStart(new Date(messageTs)).getTime();
    const endTsMs = getWeekEnd(new Date(messageTs)).getTime();
    await syncNonThreaded(
      channelId,
      channel.name,
      startTsMs,
      endTsMs,
      connectorId
    );
    await saveSuccessSyncActivity(connectorId);
  }
  // /!\ Any signal received outside of the while loop will be lost, so don't make any async
  // call here, which will allow the signal handler to be executed by the nodejs event loop. /!\
}

export async function memberJoinedChannel(connectorId: ModelId): Promise<void> {
  const channelsToJoin: string[] = [];
  setHandler(
    botJoinedChanelSignal,
    ({ channelId }: botJoinedChanelSignalInput) => {
      if (channelsToJoin.indexOf(channelId) === -1) {
        channelsToJoin.push(channelId);
      }
    }
  );

  let channelId: string | undefined;
  while ((channelId = channelsToJoin.shift())) {
    const channel = await getChannel(connectorId, channelId);
    if (!channel.name) {
      throw new Error(`Could not find channel name for channel ${channelId}`);
    }
    const channelName = channel.name;
    await executeChild(syncOneChannel.name, {
      workflowId: syncOneChanneWorkflowlId(connectorId, channelId),
      args: [connectorId, channelId, channelName, true],
      memo: workflowInfo().memo,
    });
  }
  // /!\ Any signal received outside of the while loop will be lost, so don't make any async
  // call here, which will allow the signal handler to be executed by the nodejs event loop. /!\
}

export async function slackGarbageCollectorWorkflow(
  connectorId: ModelId
): Promise<void> {
  const { channelsToDeleteFromConnectorsDb, channelsToDeleteFromDataSource } =
    await getChannelsToGarbageCollect(connectorId);
  for (const channelId of channelsToDeleteFromDataSource) {
    await deleteChannel(channelId, connectorId);
  }
  await deleteChannelsFromConnectorDb(
    channelsToDeleteFromConnectorsDb,
    connectorId
  );
}

export function workspaceFullSyncWorkflowId(
  connectorId: ModelId,
  fromTs: number | null
) {
  if (fromTs) {
    return `slack-workspaceFullSync-${connectorId}-fromTs-${fromTs}`;
  }
  return `slack-workspaceFullSync-${connectorId}`;
}

export function syncOneChanneWorkflowlId(
  connectorId: ModelId,
  channelId: string
) {
  return `slack-syncOneChannel-${connectorId}-${channelId}`;
}

export function syncOneThreadDebouncedWorkflowId(
  connectorId: ModelId,
  channelId: string,
  threadTs: string
) {
  return `slack-syncOneThreadDebounced-${connectorId}-${channelId}-${threadTs}`;
}

export function syncOneMessageDebouncedWorkflowId(
  connectorId: ModelId,
  channelId: string,
  startTsMs: number
) {
  return `slack-syncOneMessageDebounced-${connectorId}-${channelId}-${startTsMs}`;
}

export function botJoinedChannelWorkflowId(connectorId: ModelId) {
  return `slack-botJoinedChannel-${connectorId}`;
}

export function slackGarbageCollectorWorkflowId(connectorId: ModelId) {
  return `slack-GarbageCollector-${connectorId}`;
}
