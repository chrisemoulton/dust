import { google } from "googleapis";
import { drive_v3 } from "googleapis";
import { GaxiosResponse } from "googleapis-common";

import {
  getLocalParents,
  registerWebhook,
} from "@connectors/connectors/google_drive/lib";
import { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import {
  Connector,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
  ModelId,
  sequelize_conn,
} from "@connectors/lib/models.js";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import {
  ConnectorPermission,
  ConnectorResource,
  ConnectorResourceType,
} from "@connectors/types/resources";

import {
  driveObjectToDustType,
  folderHasChildren,
  getAuthObject,
  getDocumentId,
  getDriveClient,
  getDrivesIds,
  getGoogleCredentials,
  getGoogleDriveObject,
} from "./temporal/activities";
import { launchGoogleDriveFullSyncWorkflow } from "./temporal/client";
export type NangoConnectionId = string;
import { v4 as uuidv4 } from "uuid";

const {
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = process.env;

export async function createGoogleDriveConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  try {
    const connector = await sequelize_conn.transaction(
      async (t): Promise<Connector> => {
        if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
          throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined");
        }
        const driveClient = await getDriveClient(nangoConnectionId);
        const sanityCheckRes = await driveClient.about.get({ fields: "*" });
        if (sanityCheckRes.status !== 200) {
          throw new Error(
            `Could not get google drive info. Error message: ${
              sanityCheckRes.statusText || "unknown"
            }`
          );
        }

        const connector = await Connector.create(
          {
            type: "google_drive",
            connectionId: nangoConnectionId,
            workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
            workspaceId: dataSourceConfig.workspaceId,
            dataSourceName: dataSourceConfig.dataSourceName,
            defaultNewResourcePermission: "read_write",
          },
          { transaction: t }
        );

        const webhookInfo = await registerWebhook(connector.connectionId);
        if (webhookInfo.isErr()) {
          throw webhookInfo.error;
        } else {
          await GoogleDriveWebhook.create(
            {
              webhookId: webhookInfo.value.id,
              expiresAt: new Date(webhookInfo.value.expirationTsMs),
              renewAt: new Date(webhookInfo.value.expirationTsMs),
              connectorId: connector.id,
            },
            { transaction: t }
          );
        }

        return connector;
      }
    );
    return new Ok(connector.id.toString());
  } catch (err) {
    logger.error(
      {
        err,
      },
      "Error creating Google Drive connector"
    );
    return new Err(new Error("Error creating Google Drive connector"));
  }
}

export async function updateGoogleDriveConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: NangoConnectionId | null;
  }
): Promise<Result<string, ConnectorsAPIErrorResponse>> {
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID not set");
  }

  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err({
      error: {
        message: "Connector not found",
        type: "connector_not_found",
      },
    });
  }

  // Ideally we want to check that the Google Project ID is the same as the one from the connector
  // I couln't find an easy way to access it from the googleapis library
  // Workaround is checking the domain of the user who is updating the connector
  if (connectionId) {
    try {
      const oldConnectionId = c.connectionId;
      const currentDriveClient = await getDriveClient(oldConnectionId);
      const currentDriveUser = await currentDriveClient.about.get({
        fields: "user",
      });
      const currentUserEmail = currentDriveUser.data?.user?.emailAddress || "";
      const currentDriveUserDomain = currentUserEmail.split("@")[1];

      const newDriveClient = await getDriveClient(connectionId);
      const newDriveUser = await newDriveClient.about.get({
        fields: "user",
      });
      const newDriveUserEmail = newDriveUser.data?.user?.emailAddress || "";
      const newDriveUserDomain = newDriveUserEmail.split("@")[1];

      if (!currentDriveUserDomain || !newDriveUserDomain) {
        return new Err({
          error: {
            type: "connector_update_error",
            message: "Error retrieving google drive info to update connector",
          },
        });
      }

      if (currentDriveUserDomain !== newDriveUserDomain) {
        return new Err({
          error: {
            type: "connector_oauth_target_mismatch",
            message: "Cannot change domain of a Google Drive connector",
          },
        });
      }
    } catch (e) {
      logger.error(
        {
          error: e,
        },
        `Error checking Google domain of user who is updating the connector - lets update the connector regardless`
      );
    }

    const oldConnectionId = c.connectionId;
    await c.update({ connectionId });
    nangoDeleteConnection(
      oldConnectionId,
      NANGO_GOOGLE_DRIVE_CONNECTOR_ID
    ).catch((e) => {
      logger.error(
        { error: e, oldConnectionId },
        "Error deleting old Nango connection"
      );
    });
  }

  return new Ok(c.id.toString());
}

export async function cleanupGoogleDriveConnector(
  connectorId: string,
  force = false
): Promise<Result<void, Error>> {
  return sequelize_conn.transaction(async (transaction) => {
    const connector = await Connector.findByPk(connectorId, {
      transaction: transaction,
    });
    if (!connector) {
      return new Err(
        new Error(`Could not find connector with id ${connectorId}`)
      );
    }
    if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
      return new Err(
        new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined")
      );
    }
    if (!GOOGLE_CLIENT_ID) {
      return new Err(new Error("GOOGLE_CLIENT_ID is not defined"));
    }
    if (!GOOGLE_CLIENT_SECRET) {
      return new Err(new Error("GOOGLE_CLIENT_SECRET is not defined"));
    }

    const authClient = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );
    try {
      const credentials = await getGoogleCredentials(connector.connectionId);

      const revokeTokenRes = await authClient.revokeToken(
        credentials.credentials.refresh_token
      );

      if (revokeTokenRes.status !== 200) {
        logger.error(
          {
            error: revokeTokenRes.data,
          },
          "Could not revoke token"
        );
        if (!force) {
          return new Err(new Error("Could not revoke token"));
        }
      }
    } catch (err) {
      if (!force) {
        throw err;
      } else {
        logger.error(
          {
            err,
          },
          "Error revoking token"
        );
      }
    }
    const nangoRes = await nangoDeleteConnection(
      connector.connectionId,
      NANGO_GOOGLE_DRIVE_CONNECTOR_ID
    );
    if (nangoRes.isErr()) {
      if (!force) {
        return nangoRes;
      } else {
        logger.error(
          {
            err: nangoRes.error,
          },
          "Error deleting connection from Nango"
        );
      }
    }

    await GoogleDriveFolders.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction: transaction,
    });
    await GoogleDriveFiles.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction: transaction,
    });

    await GoogleDriveSyncToken.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction: transaction,
    });
    await GoogleDriveWebhook.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction: transaction,
    });

    await connector.destroy({
      transaction: transaction,
    });

    return new Ok(undefined);
  });
}

export async function retrieveGoogleDriveConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }
  const authCredentials = await getAuthObject(c.connectionId);
  if (filterPermission === "read") {
    if (parentInternalId === null) {
      // Return the list of folders explicitly selected by the user.
      const folders = await GoogleDriveFolders.findAll({
        where: {
          connectorId: connectorId,
        },
      });

      const resources = (
        await Promise.all(
          folders.map(async (f): Promise<ConnectorResource | null> => {
            const fd = await getGoogleDriveObject(authCredentials, f.folderId);
            if (!fd) {
              return null;
            }
            return {
              provider: c.type,
              internalId: f.folderId,
              parentInternalId: null,
              type: "folder",
              title: fd.name || "",
              sourceUrl: fd.webViewLink || null,
              dustDocumentId: null,
              lastUpdatedAt: fd.updatedAtMs || null,
              expandable:
                (await GoogleDriveFiles.count({
                  where: {
                    connectorId: connectorId,
                    parentId: f.folderId,
                    mimeType: "application/vnd.google-apps.folder",
                  },
                })) > 0,
              permission: "read",
            };
          })
        )
      ).flatMap((f) => (f ? [f] : []));

      resources.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(resources);
    } else {
      // Return the list of all folders and files synced in a parent folder.
      const folderOrFiles = await GoogleDriveFiles.findAll({
        where: {
          connectorId: connectorId,
          parentId: parentInternalId,
        },
      });

      const resources: ConnectorResource[] = await Promise.all(
        folderOrFiles.map((f) => {
          return (async () => {
            return {
              provider: c.type,
              internalId: f.driveFileId,
              parentInternalId: null,
              type:
                f.mimeType === "application/vnd.google-apps.folder"
                  ? "folder"
                  : "file",
              title: f.name || "",
              dustDocumentId:
                f.mimeType === "application/vnd.google-apps.folder"
                  ? null
                  : getDocumentId(f.driveFileId),
              lastUpdatedAt: f.lastSeenTs?.getTime() || null,
              sourceUrl: null,
              expandable:
                (await GoogleDriveFiles.count({
                  where: {
                    connectorId: connectorId,
                    parentId: f.driveFileId,
                    mimeType: "application/vnd.google-apps.folder",
                  },
                })) > 0,
              permission: "read",
            };
          })();
        })
      );

      // Sorting resources, folders first then alphabetically.
      resources.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.title.localeCompare(b.title);
      });

      return new Ok(resources);
    }
  } else if (filterPermission === null) {
    if (parentInternalId === null) {
      // Return the list of remote shared drives.
      const drives = await getDrivesIds(c.connectionId);
      const resources: ConnectorResource[] = await Promise.all(
        drives.map(async (d): Promise<ConnectorResource> => {
          const driveObject = await getGoogleDriveObject(authCredentials, d.id);
          if (!driveObject) {
            throw new Error(`Drive ${d.id} unexpectedly not found (got 404).`);
          }
          return {
            provider: c.type,
            internalId: driveObject.id,
            parentInternalId: driveObject.parent,
            type: "folder" as ConnectorResourceType,
            title: driveObject.name,
            sourceUrl: driveObject.webViewLink || null,
            dustDocumentId: null,
            lastUpdatedAt: driveObject.updatedAtMs || null,
            expandable: await folderHasChildren(connectorId, driveObject.id),
            permission: (await GoogleDriveFolders.findOne({
              where: {
                connectorId: connectorId,
                folderId: driveObject.id,
              },
            }))
              ? "read"
              : "none",
          };
        })
      );

      resources.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(resources);
    } else {
      // Return the list of remote folders inside a parent folder.
      const drive = await getDriveClient(authCredentials);
      let nextPageToken: string | undefined = undefined;
      let remoteFolders: drive_v3.Schema$File[] = [];
      do {
        const res: GaxiosResponse<drive_v3.Schema$FileList> =
          await drive.files.list({
            corpora: "allDrives",
            pageSize: 200,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields:
              "nextPageToken, files(id, name, parents, mimeType, createdTime, modifiedTime, trashed, webViewLink)",
            q: `'${parentInternalId}' in parents and mimeType='application/vnd.google-apps.folder'`,
            pageToken: nextPageToken,
          });

        if (res.status !== 200) {
          throw new Error(
            `Error getting files. status_code: ${res.status}. status_text: ${res.statusText}`
          );
        }
        if (!res.data.files) {
          throw new Error("Files list is undefined");
        }
        remoteFolders = remoteFolders.concat(res.data.files);
        nextPageToken = res.data.nextPageToken || undefined;
      } while (nextPageToken);

      const resources: ConnectorResource[] = await Promise.all(
        remoteFolders.map(async (rf): Promise<ConnectorResource> => {
          const driveObject = await driveObjectToDustType(rf, authCredentials);

          return {
            provider: c.type,
            internalId: driveObject.id,
            parentInternalId: driveObject.parent,
            type: "folder" as ConnectorResourceType,
            title: driveObject.name,
            sourceUrl: driveObject.webViewLink || null,
            expandable: await folderHasChildren(connectorId, driveObject.id),
            dustDocumentId: null,
            lastUpdatedAt: driveObject.updatedAtMs || null,
            permission: (await GoogleDriveFolders.findOne({
              where: {
                connectorId: connectorId,
                folderId: driveObject.id,
              },
            }))
              ? "read"
              : "none",
          };
        })
      );

      resources.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });

      return new Ok(resources);
    }
  } else {
    return new Err(new Error(`Invalid permission: ${filterPermission}`));
  }
}

export async function setGoogleDriveConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  let shouldFullSync = false;
  for (const [id, permission] of Object.entries(permissions)) {
    shouldFullSync = true;
    if (permission === "none") {
      await GoogleDriveFolders.destroy({
        where: {
          connectorId: connectorId,
          folderId: id,
        },
      });
    } else if (permission === "read") {
      await GoogleDriveFolders.upsert({
        connectorId: connectorId,
        folderId: id,
      });
    } else {
      return new Err(
        new Error(`Invalid permission ${permission} for resource ${id}`)
      );
    }
  }

  if (shouldFullSync) {
    await launchGoogleDriveFullSyncWorkflow(connectorId.toString(), null);
  }

  return new Ok(undefined);
}

export async function retrieveGoogleDriveObjectsTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string>, Error>> {
  const googleDriveFiles = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connectorId,
      driveFileId: internalIds,
    },
  });

  const titles = googleDriveFiles.reduce((acc, curr) => {
    acc[curr.driveFileId] = curr.name;
    return acc;
  }, {} as Record<string, string>);

  return new Ok(titles);
}

export async function retrieveGoogleDriveObjectsParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  const memo = memoizationKey || uuidv4();
  try {
    const parents = await getLocalParents(connectorId, internalId, memo);
    return new Ok(parents);
  } catch (err) {
    return new Err(err as Error);
  }
}
