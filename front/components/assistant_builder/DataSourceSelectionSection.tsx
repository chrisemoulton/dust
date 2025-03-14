import {
  Button,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  ContextItem,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";

import { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { CONNECTOR_PROVIDER_TO_RESOURCE_NAME } from "@app/components/assistant_builder/shared";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { classNames } from "@app/lib/utils";

export default function DataSourceSelectionSection({
  dataSourceConfigurations,
  openDataSourceModal,
  canAddDataSource,
  onManageDataSource,
  onDelete,
}: {
  dataSourceConfigurations: Record<
    string,
    AssistantBuilderDataSourceConfiguration
  >;
  openDataSourceModal: () => void;
  canAddDataSource: boolean;
  onManageDataSource: (name: string) => void;
  onDelete?: (name: string) => void;
}) {
  return (
    <div className="overflow-hidden">
      <div className="flex flex-row items-start">
        <div className="pb-3 text-sm font-bold text-element-900">
          Select Data Sources:
        </div>
        <div className="flex-grow" />
        {Object.keys(dataSourceConfigurations).length > 0 && (
          <Button
            labelVisible={true}
            label="Add Data Sources"
            variant="primary"
            size="sm"
            icon={PlusIcon}
            onClick={openDataSourceModal}
            disabled={!canAddDataSource}
            hasMagnifying={false}
          />
        )}
      </div>
      {!Object.keys(dataSourceConfigurations).length ? (
        <div
          className={classNames(
            "flex h-full min-h-48 items-center justify-center rounded-lg bg-structure-50"
          )}
        >
          <Button
            labelVisible={true}
            label="Add Data Sources"
            variant="primary"
            size="md"
            icon={PlusIcon}
            onClick={openDataSourceModal}
            disabled={!canAddDataSource}
          />
        </div>
      ) : (
        <ContextItem.List className="mt-6 border-b border-t border-structure-200">
          {Object.entries(dataSourceConfigurations).map(
            ([key, { dataSource, selectedResources, isSelectAll }]) => {
              const selectedParentIds = Object.keys(selectedResources);
              return (
                <ContextItem
                  key={key}
                  title={
                    dataSource.connectorProvider
                      ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider]
                          .name
                      : dataSource.name
                  }
                  visual={
                    <ContextItem.Visual
                      visual={
                        dataSource.connectorProvider
                          ? CONNECTOR_CONFIGURATIONS[
                              dataSource.connectorProvider
                            ].logoComponent
                          : CloudArrowDownIcon
                      }
                    />
                  }
                  action={
                    <Button.List>
                      <Button
                        icon={TrashIcon}
                        variant="secondaryWarning"
                        label="Remove"
                        labelVisible={false}
                        onClick={() => {
                          onDelete?.(key);
                        }}
                      />
                      <Button
                        variant="secondary"
                        icon={Cog6ToothIcon}
                        label="Manage"
                        size="sm"
                        onClick={() => {
                          onManageDataSource(key);
                        }}
                        disabled={dataSource.connectorProvider === null}
                      />
                    </Button.List>
                  }
                >
                  <ContextItem.Description
                    description={
                      dataSource.connectorProvider && !isSelectAll
                        ? `Assistant has access to ${
                            selectedParentIds.length
                          } ${
                            selectedParentIds.length === 1
                              ? CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                                  dataSource.connectorProvider
                                ].singular
                              : CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                                  dataSource.connectorProvider
                                ].plural
                          }`
                        : "Assistant has access to all documents"
                    }
                  />
                </ContextItem>
              );
            }
          )}
        </ContextItem.List>
      )}
    </div>
  );
}
