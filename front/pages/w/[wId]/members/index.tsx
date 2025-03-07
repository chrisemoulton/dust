import {
  Avatar,
  Button,
  ChevronRightIcon,
  Chip,
  ClipboardIcon,
  Cog6ToothIcon,
  DropdownMenu,
  Icon,
  Input,
  Modal,
  Page,
  PlusIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import { UsersIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { useContext, useState } from "react";
import { useSWRConfig } from "swr";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import {
  Authenticator,
  getSession,
  getUserFromSession,
  RoleType,
} from "@app/lib/auth";
import { useMembers, useWorkspaceInvitations } from "@app/lib/swr";
import { classNames, isEmailValid } from "@app/lib/utils";
import { MembershipInvitationType } from "@app/types/membership_invitation";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "", URL = "" } = process.env;

const CLOSING_ANIMATION_DURATION = 200;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
  url: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      url: URL,
    },
  };
};

export default function WorkspaceAdmin({
  user,
  owner,
  gaTrackingId,
  url,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const inviteLink =
    owner.allowedDomain !== null ? `${url}/w/${owner.sId}/join` : null;
  const [inviteSettingsModalOpen, setInviteSettingsModalOpen] = useState(false);

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "members" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Member Management"
          icon={UsersIcon}
          description="Invite and remove members, manage their rights."
        />
        <InviteSettingsModal
          showModal={inviteSettingsModalOpen}
          onClose={() => {
            setInviteSettingsModalOpen(false);
          }}
          owner={owner}
        />
        <Page.Vertical gap="xs">
          <Page.H variant="h5">Invitation link</Page.H>
          <Page.P variant="secondary">
            Allow any person with the right email domain name (
            <em>@company.com</em>) to signup and join your workspace.
          </Page.P>
          <>
            {inviteLink && (
              <Page.P variant="secondary">
                Invitation link is activated for domain{" "}
                <span className="font-bold">{`@${owner.allowedDomain}`}</span>.
              </Page.P>
            )}
            <div className="mt-3 flex w-full flex-col justify-between gap-2 sm:flex-row">
              <div className="flex-grow">
                <Input
                  className=""
                  disabled
                  placeholder={""}
                  value={inviteLink}
                  name={""}
                />
              </div>
              <div className="relative bottom-0.5 flex flex-row gap-2">
                <div className="flex-none">
                  <Button
                    variant="secondary"
                    label="Copy"
                    size="sm"
                    icon={ClipboardIcon}
                    disabled={!inviteLink}
                    onClick={() => {
                      if (!inviteLink) return;
                      void navigator.clipboard.writeText(inviteLink);
                    }}
                  />
                </div>
                <div className="flex-none">
                  <Button
                    variant="secondary"
                    label="Settings"
                    size="sm"
                    icon={Cog6ToothIcon}
                    onClick={() => setInviteSettingsModalOpen(true)}
                  />
                </div>
              </div>
            </div>
          </>
        </Page.Vertical>

        <MemberList />
      </Page.Vertical>
    </AppLayout>
  );

  function MemberList() {
    const COLOR_FOR_ROLE: { [key: string]: "red" | "amber" | "emerald" } = {
      admin: "red",
      builder: "amber",
      user: "emerald",
    };
    const [searchText, setSearchText] = useState("");
    const { members, isMembersLoading } = useMembers(owner);
    const { invitations, isInvitationsLoading } =
      useWorkspaceInvitations(owner);
    const [inviteEmailModalOpen, setInviteEmailModalOpen] = useState(false);
    /** Modal for changing member role: we need to use 2 states: set the member
     * first, then open the modal with an unoticeable delay. Using
     * only 1 state for both would break the modal animation because rerendering
     * at the same time than switching modal to open*/
    const [changeRoleModalOpen, setChangeRoleModalOpen] = useState(false);
    const [changeRoleMember, setChangeRoleMember] = useState<UserType | null>(
      null
    );
    /* Same for invitations modal */
    const [revokeInvitationModalOpen, setRevokeInvitationModalOpen] =
      useState(false);
    const [invitationToRevoke, setInvitationToRevoke] =
      useState<MembershipInvitationType | null>(null);

    function isInvitation(
      arg: MembershipInvitationType | UserType
    ): arg is MembershipInvitationType {
      return (arg as MembershipInvitationType).inviteEmail !== undefined;
    }

    const displayedMembersAndInvitations: (
      | UserType
      | MembershipInvitationType
    )[] = [
      ...members
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((m) => m.workspaces[0].role !== "none")
        .filter(
          (m) =>
            !searchText ||
            m.name.toLowerCase().includes(searchText.toLowerCase()) ||
            m.email?.toLowerCase().includes(searchText.toLowerCase()) ||
            m.username?.toLowerCase().includes(searchText.toLowerCase())
        ),
      ...invitations
        .sort((a, b) => a.inviteEmail.localeCompare(b.inviteEmail))
        .filter((i) => i.status === "pending")
        .filter(
          (i) =>
            !searchText ||
            i.inviteEmail.toLowerCase().includes(searchText.toLowerCase())
        ),
    ];
    return (
      <>
        <InviteEmailModal
          showModal={inviteEmailModalOpen}
          onClose={() => {
            setInviteEmailModalOpen(false);
          }}
          owner={owner}
        />
        <RevokeInvitationModal
          showModal={revokeInvitationModalOpen}
          invitation={invitationToRevoke}
          onClose={() => setRevokeInvitationModalOpen(false)}
          owner={owner}
        />
        <ChangeMemberModal
          showModal={changeRoleModalOpen}
          member={changeRoleMember}
          onClose={() => setChangeRoleModalOpen(false)}
          owner={owner}
        />
        <Page.Vertical gap="sm" align="stretch">
          <Page.H variant="h5">Member list</Page.H>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row">
            <div className="flex-grow">
              <Searchbar
                placeholder="Search members"
                onChange={setSearchText}
                value={searchText}
                name={""}
              />
            </div>
            <div className="flex-none">
              <Button
                variant="primary"
                label="Invite members"
                size="sm"
                icon={PlusIcon}
                onClick={() => setInviteEmailModalOpen(true)}
              />
            </div>
          </div>
          <div className="s-w-full">
            {displayedMembersAndInvitations.map(
              (item: UserType | MembershipInvitationType) => (
                <div
                  key={
                    isInvitation(item)
                      ? `invitation-${item.id}`
                      : `member-${item.id}`
                  }
                  className="transition-color flex cursor-pointer items-center justify-center gap-3 border-t border-structure-200 p-2 text-xs duration-200 hover:bg-action-50 sm:text-sm"
                  onClick={() => {
                    if (user?.id === item.id) return; // no action on self
                    if (isInvitation(item)) setInvitationToRevoke(item);
                    else setChangeRoleMember(item);
                    /* Delay to let react re-render the modal before opening it otherwise no animation transition */
                    setTimeout(() => {
                      if (isInvitation(item))
                        setRevokeInvitationModalOpen(true);
                      else setChangeRoleModalOpen(true);
                    }, 50);
                  }}
                >
                  <div className="hidden sm:block">
                    {isInvitation(item) ? (
                      <Avatar size="sm" />
                    ) : (
                      <Avatar visual={item.image} name={item.name} size="sm" />
                    )}
                  </div>
                  <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                    {!isInvitation(item) && (
                      <div className="font-medium text-element-900">
                        {item.name}
                        {user?.id === item.id && " (you)"}
                      </div>
                    )}

                    <div className="grow font-normal text-element-700">
                      {isInvitation(item)
                        ? item.inviteEmail
                        : item.email || item.username}
                    </div>
                  </div>
                  <div>
                    {isInvitation(item) ? (
                      <Chip size="xs" color="slate">
                        Invitation {item.status}
                      </Chip>
                    ) : (
                      <Chip
                        size="xs"
                        color={COLOR_FOR_ROLE[item.workspaces[0].role]}
                        className="capitalize"
                      >
                        {item.workspaces[0].role}
                      </Chip>
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <Icon
                      visual={ChevronRightIcon}
                      className={classNames(
                        "text-element-600",
                        user?.id === item.id ? "invisible" : ""
                      )}
                    />
                  </div>
                </div>
              )
            )}
            {(isMembersLoading || isInvitationsLoading) && (
              <div className="flex animate-pulse cursor-pointer items-center justify-center gap-3 border-t border-structure-200 bg-structure-50 py-2 text-xs sm:text-sm">
                <div className="hidden sm:block">
                  <Avatar size="xs" />
                </div>
                <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                  <div className="font-medium text-element-900">Loading...</div>
                  <div className="grow font-normal text-element-700"></div>
                </div>
                <div>
                  <Chip size="xs" color="slate">
                    Loading...
                  </Chip>
                </div>
                <div className="hidden sm:block">
                  <ChevronRightIcon />
                </div>
              </div>
            )}
          </div>
        </Page.Vertical>
      </>
    );
  }
}

function InviteEmailModal({
  showModal,
  onClose,
  owner,
}: {
  showModal: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  const { mutate } = useSWRConfig();
  const sendNotification = useContext(SendNotificationsContext);
  async function handleSendInvitation(): Promise<void> {
    if (!isEmailValid(inviteEmail)) {
      setEmailError("Invalid email address.");
      return;
    }
    const res = await fetch(`/api/w/${owner.sId}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inviteEmail,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Invite failed",
        description: "Failed to invite new member to workspace.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Invite sent",
        description: `Invite sent to ${inviteEmail}. You can repeat the operation to invite other users.`,
      });
      await mutate(`/api/w/${owner.sId}/invitations`);
    }
  }

  return (
    <Modal
      isOpen={showModal}
      onClose={onClose}
      hasChanged={emailError === "" && inviteEmail !== "" && !isSending}
      title="Invite new users"
      type="right-side"
      saveLabel="Invite"
      isSaving={isSending}
      onSave={async () => {
        setIsSending(true);
        await handleSendInvitation();
        setIsSending(false);
        setInviteEmail("");
      }}
    >
      <div className="mt-6 flex flex-col gap-6 px-2 text-sm">
        <Page.P>
          Invite a new user to your workspace. They will receive an email with a
          link to join your workspace.
        </Page.P>
        <div className="flex flex-grow flex-col gap-1.5">
          <div className="font-semibold">Email to send invite to:</div>
          <div className="flex items-start gap-2">
            <div className="flex-grow">
              <Input
                placeholder={"Email address"}
                value={inviteEmail || ""}
                name={""}
                error={emailError}
                showErrorLabel={true}
                onChange={(e) => {
                  setInviteEmail(e.trim());
                  setEmailError("");
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function InviteSettingsModal({
  showModal,
  onClose,
  owner,
}: {
  showModal: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}) {
  const [domainUpdating, setDomainUpdating] = useState(false);
  const [domainInput, setDomainInput] = useState(owner.allowedDomain || "");
  const [allowedDomainError, setAllowedDomainError] = useState("");
  const sendNotification = useContext(SendNotificationsContext);
  async function handleUpdateWorkspace(): Promise<void> {
    setDomainUpdating(true);
    const res = await fetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowedDomain: domainInput,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Update failed",
        description: `Failed to update workspace with new domain ${domainInput}.`,
      });
      setDomainUpdating(false);
    } else {
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  }
  function validDomain(): boolean {
    let valid = true;
    if (domainInput === null) {
      setAllowedDomainError("");
    } else {
      // eslint-disable-next-line no-useless-escape
      if (!domainInput.match(/^[a-z0-9\.\-]*$/)) {
        setAllowedDomainError("Allowed domain must be a valid domain name.");
        valid = false;
      } else {
        setAllowedDomainError("");
      }
    }

    return valid;
  }

  return (
    <Modal
      isOpen={showModal}
      onClose={onClose}
      hasChanged={
        domainInput !== owner.allowedDomain &&
        !allowedDomainError &&
        !domainUpdating
      }
      title="Invitation link settings"
      type="right-side"
      onSave={() => validDomain() && handleUpdateWorkspace()}
    >
      <div className="mt-6 flex flex-col gap-6 px-2">
        <div>
          Any person with a Google Workspace email on corresponding domain name
          will be allowed to join the workspace.
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="font-bold">Whitelisted email domain</div>
          <Input
            className="text-sm"
            placeholder={"Company domain"}
            value={domainInput}
            name={""}
            error={allowedDomainError}
            showErrorLabel={true}
            onChange={(e) => {
              setDomainInput(e);
              setAllowedDomainError("");
            }}
            disabled={domainUpdating}
          />
        </div>
      </div>
    </Modal>
  );
}

function RevokeInvitationModal({
  showModal,
  onClose,
  invitation,
  owner,
}: {
  showModal: boolean;
  onClose: () => void;
  invitation: MembershipInvitationType | null;
  owner: WorkspaceType;
}) {
  const { mutate } = useSWRConfig();
  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);
  if (!invitation) return null;

  async function handleRevokeInvitation(
    invitation: MembershipInvitationType
  ): Promise<void> {
    const res = await fetch(
      `/api/w/${owner.sId}/invitations/${invitation.id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "revoked",
        }),
      }
    );
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Revoke failed",
        description: "Failed to revoke member's invitation.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Invitation revoked",
        description: `Invitation revoked for ${invitation.inviteEmail}.`,
      });
      await mutate(`/api/w/${owner.sId}/invitations`);
    }
  }

  return (
    <Modal
      isOpen={showModal}
      onClose={onClose}
      hasChanged={false}
      title="Revoke invitation"
      isSaving={isSaving}
      type="default"
    >
      <div className="mt-6 flex flex-col gap-6 px-2">
        <div>
          Revoke invitation for user with email{" "}
          <span className="font-bold">{invitation?.inviteEmail}</span>?
        </div>
        <div className="flex gap-2">
          <Button variant="tertiary" label="Cancel" onClick={onClose} />
          <Button
            variant="primaryWarning"
            label={isSaving ? "Revoking..." : "Yes, revoke"}
            onClick={async () => {
              setIsSaving(true);
              await handleRevokeInvitation(invitation);
              onClose();
              /* Delay to let react close the modal before cleaning isSaving, to
               * avoid the user seeing the button change label again during the closing animation */
              setTimeout(() => {
                setIsSaving(false);
              }, CLOSING_ANIMATION_DURATION);
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

function ChangeMemberModal({
  showModal,
  onClose,
  member,
  owner,
}: {
  showModal: boolean;
  onClose: () => void;
  member: UserType | null;
  owner: WorkspaceType;
}) {
  const { mutate } = useSWRConfig();
  const [revokeMemberModalOpen, setRevokeMemberModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);
  if (!member) return null; // Unreachable

  async function handleMemberRoleChange(
    member: UserType,
    role: RoleType
  ): Promise<void> {
    const res = await fetch(`/api/w/${owner.sId}/members/${member.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: role === "none" ? "revoked" : role,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Update failed",
        description: "Failed to update member's role.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Role updated",
        description: `Role updated for ${member.name}.`,
      });
      await mutate(`/api/w/${owner.sId}/members`);
    }
  }

  const roleTexts: { [k: string]: string } = {
    admin: "Admins can manage members, in addition to builders' rights.",
    builder:
      "Builders can create custom assistants and use advanced dev tools.",
    user: "Users can use assistants provided by Dust as well as custom assistants created by their company.",
  };
  return (
    <Modal
      isOpen={showModal}
      onClose={onClose}
      isSaving={isSaving}
      hasChanged={
        selectedRole !== null && selectedRole !== member.workspaces[0].role
      }
      title={member.name || "Unreachable"}
      type="right-side"
      onSave={async () => {
        setIsSaving(true);
        if (!selectedRole) return; // unreachable due to hasChanged
        await handleMemberRoleChange(member, selectedRole);
        onClose();
        /* Delay to let react close the modal before cleaning isSaving, to
         * avoid the user seeing the button change label again during the closing animation */
        setTimeout(() => {
          setIsSaving(false);
        }, CLOSING_ANIMATION_DURATION);
      }}
      saveLabel="Update role"
    >
      <div className="mt-6 flex flex-col gap-9 px-2 text-sm text-element-700">
        <div className="flex items-center gap-4">
          <Avatar size="lg" visual={member.image} name={member.name} />
          <div className="flex grow flex-col">
            <div className="font-semibold text-element-900">{member.name}</div>
            <div className="font-normal">{member.email}</div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="font-bold text-element-900">Role:</div>
            <DropdownMenu>
              <DropdownMenu.Button type="select">
                <Button
                  variant="secondary"
                  label={selectedRole || member.workspaces[0].role}
                  size="sm"
                  type="select"
                  className="capitalize"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topLeft">
                {["admin", "builder", "user"].map((role) => (
                  <DropdownMenu.Item
                    key={role}
                    onClick={() => setSelectedRole(role as RoleType)}
                    label={role.charAt(0).toUpperCase() + role.slice(1)}
                  />
                ))}
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
          <Page.P>
            The role defines the rights of a member of the workspace.{" "}
            {roleTexts[member.workspaces[0].role]}
          </Page.P>
        </div>
        <div className="flex flex-none flex-col gap-2">
          <div className="flex-none">
            <Button
              variant="primaryWarning"
              label="Revoke member access"
              size="sm"
              onClick={() => setRevokeMemberModalOpen(true)}
            />
          </div>
          <Page.P>
            Deleting a member will remove them from the workspace. They will be
            able to rejoin if they have an invitation link.
          </Page.P>
        </div>
      </div>
      <Modal
        onClose={() => setRevokeMemberModalOpen(false)}
        isOpen={revokeMemberModalOpen}
        title="Revoke member access"
        hasChanged={false}
        type="default"
      >
        <div className="mt-6 flex flex-col gap-6 px-2">
          <div>
            Revoke access for user{" "}
            <span className="font-bold">{member.name}</span>?
          </div>
          <div className="flex gap-2">
            <Button
              variant="tertiary"
              label="Cancel"
              onClick={() => setRevokeMemberModalOpen(false)}
            />
            <Button
              variant="primaryWarning"
              label={isSaving ? "Revoking..." : "Yes, revoke"}
              onClick={async () => {
                setIsSaving(true);
                await handleMemberRoleChange(member, "none");
                setRevokeMemberModalOpen(false);
                onClose();
                /* Delay to let react close the modal before cleaning isSaving, to
                 * avoid the user seeing the button change label again during the closing animation */
                setTimeout(() => {
                  setIsSaving(false);
                }, CLOSING_ANIMATION_DURATION);
              }}
            />
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
