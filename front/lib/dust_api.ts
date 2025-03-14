import { createParser } from "eventsource-parser";

import { Err, Ok } from "@app/lib/result";
import logger from "@app/logger/logger";
import { DataSourceType } from "@app/types/data_source";
import { RunType } from "@app/types/run";

const { DUST_PROD_API = "https://dust.tt", NODE_ENV } = process.env;

export type DustAPIErrorResponse = {
  type: string;
  message: string;
};

export type DustAppType = {
  workspaceId: string;
  appId: string;
  appHash: string;
};

export type DustAppConfigType = {
  [key: string]: unknown;
};

export type DustAppRunErrorEvent = {
  type: "error";
  content: {
    code: string;
    message: string;
  };
};

export type DustAppRunRunStatusEvent = {
  type: "run_status";
  content: {
    status: "running" | "succeeded" | "errored";
    run_id: string;
  };
};

export type DustAppRunBlockStatusEvent = {
  type: "block_status";
  content: {
    block_type: string;
    name: string;
    status: "running" | "succeeded" | "errored";
    success_count: number;
    error_count: number;
  };
};

export type DustAppRunBlockExecutionEvent = {
  type: "block_execution";
  content: {
    block_type: string;
    block_name: string;
    execution: {
      value: unknown | null;
      error: string | null;
      meta: unknown | null;
    }[][];
  };
};

export type DustAppRunFinalEvent = {
  type: "final";
};

export type DustAppRunTokensEvent = {
  type: "tokens";
  content: {
    block_type: string;
    block_name: string;
    input_index: number;
    map: {
      name: string;
      iteration: number;
    } | null;
    tokens: {
      text: string;
      tokens?: string[];
      logprobs?: number[];
    };
  };
};

export type DustAppRunFunctionCallEvent = {
  type: "function_call";
  content: {
    block_type: string;
    block_name: string;
    input_index: number;
    map: {
      name: string;
      iteration: number;
    } | null;
    function_call: {
      name: string;
    };
  };
};

export type DustAppRunFunctionCallArgumentsTokensEvent = {
  type: "function_call_arguments_tokens";
  content: {
    block_type: string;
    block_name: string;
    input_index: number;
    map: {
      name: string;
      iteration: number;
    } | null;
    tokens: {
      text: string;
    };
  };
};

export type DustAPICredentials = {
  apiKey: string;
  workspaceId: string;
};

/**
 * This help functions process a streamed response in the format of the Dust API for running
 * streamed apps.
 *
 * @param res an HTTP response ready to be consumed as a stream
 */
export async function processStreamedRunResponse(res: Response) {
  if (!res.ok || !res.body) {
    return new Err({
      type: "dust_api_error",
      message: `Error running streamed app: status_code=${res.status}`,
    });
  }

  let hasRunId = false;
  let rejectDustRunIdPromise: (err: Error) => void;
  let resolveDustRunIdPromise: (runId: string) => void;
  const dustRunIdPromise = new Promise<string>((resolve, reject) => {
    rejectDustRunIdPromise = reject;
    resolveDustRunIdPromise = resolve;
  });

  let pendingEvents: (
    | DustAppRunErrorEvent
    | DustAppRunRunStatusEvent
    | DustAppRunBlockStatusEvent
    | DustAppRunBlockExecutionEvent
    | DustAppRunTokensEvent
    | DustAppRunFunctionCallEvent
    | DustAppRunFunctionCallArgumentsTokensEvent
    | DustAppRunFinalEvent
  )[] = [];

  const parser = createParser((event) => {
    if (event.type === "event") {
      if (event.data) {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "error": {
              pendingEvents.push({
                type: "error",
                content: {
                  code: data.content.code,
                  message: data.content.message,
                },
              } as DustAppRunErrorEvent);
              break;
            }
            case "run_status": {
              pendingEvents.push({
                type: data.type,
                content: data.content,
              });
              break;
            }
            case "block_status": {
              pendingEvents.push({
                type: data.type,
                content: data.content,
              });
              break;
            }
            case "block_execution": {
              pendingEvents.push({
                type: data.type,
                content: data.content,
              });
              break;
            }
            case "tokens": {
              pendingEvents.push({
                type: "tokens",
                content: data.content,
              } as DustAppRunTokensEvent);
              break;
            }
            case "function_call": {
              pendingEvents.push({
                type: "function_call",
                content: data.content,
              } as DustAppRunFunctionCallEvent);
              break;
            }
            case "function_call_arguments_tokens": {
              pendingEvents.push({
                type: "function_call_arguments_tokens",
                content: data.content,
              } as DustAppRunFunctionCallArgumentsTokensEvent);
              break;
            }
            case "final": {
              pendingEvents.push({
                type: "final",
              } as DustAppRunFinalEvent);
            }
          }
          if (data.content?.run_id && !hasRunId) {
            hasRunId = true;
            resolveDustRunIdPromise(data.content.run_id);
          }
        } catch (err) {
          logger.error({ error: err }, "Failed parsing chunk from Dust API");
        }
      }
    }
  });

  const reader = res.body.getReader();

  const streamEvents = async function* () {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        parser.feed(new TextDecoder().decode(value));
        for (const event of pendingEvents) {
          yield event;
        }
        pendingEvents = [];
      }
      if (!hasRunId) {
        // once the stream is entirely consumed, if we haven't received a run id, reject the promise
        setImmediate(() => {
          logger.error("No run id received.");
          rejectDustRunIdPromise(new Error("No run id received"));
        });
      }
    } catch (e) {
      yield {
        type: "error",
        content: {
          code: "stream_error",
          message: "Error streaming chunks",
        },
      } as DustAppRunErrorEvent;
      logger.error(
        {
          error: e,
        },
        "Error streaming chunks."
      );
    } finally {
      reader.releaseLock();
    }
  };

  return new Ok({ eventStream: streamEvents(), dustRunId: dustRunIdPromise });
}

export class DustAPI {
  _credentials: DustAPICredentials;
  _useLocalInDev: boolean;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(
    credentials: DustAPICredentials,
    {
      useLocalInDev,
    }: {
      useLocalInDev: boolean;
    } = { useLocalInDev: false }
  ) {
    this._credentials = credentials;
    this._useLocalInDev = useLocalInDev;
  }

  workspaceId(): string {
    return this._credentials.workspaceId;
  }

  apiUrl() {
    return this._useLocalInDev && NODE_ENV === "development"
      ? "http://localhost:3000"
      : DUST_PROD_API;
  }

  /**
   * This functions talks directly to the Dust production API to create a run.
   *
   * @param app DustAppType the app to run streamed
   * @param config DustAppConfigType the app config
   * @param inputs any[] the app inputs
   */
  async runApp(
    app: DustAppType,
    config: DustAppConfigType,
    inputs: unknown[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    let url = `${this.apiUrl()}/api/v1/w/${app.workspaceId}/apps/${
      app.appId
    }/runs`;
    if (useWorkspaceCredentials) {
      url += "?use_workspace_credentials=true";
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
      body: JSON.stringify({
        specification_hash: app.appHash,
        config: config,
        stream: false,
        blocking: true,
        inputs: inputs,
      }),
    });

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    return new Ok(json.run as RunType);
  }

  /**
   * This functions talks directly to the Dust production API to create a streamed run.
   *
   * @param app DustAppType the app to run streamed
   * @param config DustAppConfigType the app config
   * @param inputs any[] the app inputs
   */
  async runAppStreamed(
    app: DustAppType,
    config: DustAppConfigType,
    inputs: any[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    let url = `${this.apiUrl()}/api/v1/w/${app.workspaceId}/apps/${
      app.appId
    }/runs`;
    if (useWorkspaceCredentials) {
      url += "?use_workspace_credentials=true";
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
      body: JSON.stringify({
        specification_hash: app.appHash,
        config: config,
        stream: true,
        blocking: false,
        inputs: inputs,
      }),
    });

    return processStreamedRunResponse(res);
  }

  /**
   * This actions talks to the Dust production API to retrieve the list of data sources of the
   * specified workspace id.
   *
   * @param workspaceId string the workspace id to fetch data sources for
   */
  async getDataSources(workspaceId: string) {
    const res = await fetch(
      `${this.apiUrl()}/api/v1/w/${workspaceId}/data_sources`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
        },
      }
    );

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    return new Ok(json.data_sources as DataSourceType[]);
  }
}
