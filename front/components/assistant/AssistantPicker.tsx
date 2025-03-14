import {
  Button,
  DropdownMenu,
  PlusIcon,
  RobotIcon,
  Searchbar,
  WrenchIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useState } from "react";

import { subFilter } from "@app/lib/utils";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { WorkspaceType } from "@app/types/user";

export function AssistantPicker({
  owner,
  assistants,
  onItemClick,
  pickerButton,
  showBuilderButtons,
}: {
  owner: WorkspaceType;
  assistants: AgentConfigurationType[];
  onItemClick: (assistant: AgentConfigurationType) => void;
  pickerButton?: React.ReactNode;
  showBuilderButtons?: boolean;
}) {
  const [searchText, setSearchText] = useState("");
  const [searchedAssistants, setSearchedAssistants] = useState(assistants);

  useEffect(() => {
    setSearchedAssistants(
      assistants.filter((a) =>
        subFilter(searchText.toLowerCase(), a.name.toLowerCase())
      )
    );
  }, [searchText, assistants]);

  return (
    <DropdownMenu>
      <div onClick={() => setSearchText("")}>
        {pickerButton ? (
          <DropdownMenu.Button>{pickerButton}</DropdownMenu.Button>
        ) : (
          <DropdownMenu.Button icon={RobotIcon} />
        )}
      </div>
      <DropdownMenu.Items origin="auto" width={240}>
        {assistants.length > 7 && (
          <div className="border-b border-structure-100 p-2">
            <Searchbar
              placeholder="Search"
              name="input"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchedAssistants.length > 0) {
                  onItemClick(searchedAssistants[0]);
                  setSearchText("");
                }
              }}
            />
          </div>
        )}
        <div className="max-h-[22.5rem] overflow-y-auto [&>*]:w-full">
          {searchedAssistants.map((c) => (
            <DropdownMenu.Item
              key={`assistant-picker-${c.sId}`}
              label={"@" + c.name}
              visual={c.pictureUrl}
              onClick={() => {
                onItemClick(c);
                setSearchText("");
              }}
            />
          ))}
        </div>
        {(owner.role === "admin" || owner.role === "builder") &&
          showBuilderButtons && (
            <div className="flex flex-row justify-between border-t border-structure-100 px-3 py-2">
              <Link href={`/w/${owner.sId}/builder/assistants/new`}>
                <Button
                  label="Create"
                  size="xs"
                  variant="secondary"
                  icon={PlusIcon}
                />
              </Link>
              <Link href={`/w/${owner.sId}/builder/assistants`}>
                <Button
                  label="Manage"
                  size="xs"
                  variant="tertiary"
                  icon={WrenchIcon}
                />
              </Link>
            </div>
          )}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
