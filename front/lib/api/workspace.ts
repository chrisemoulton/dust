import { Authenticator } from "@app/lib/auth";
import { RoleType } from "@app/lib/auth";
import {
  Membership,
  MembershipInvitation,
  User,
  Workspace,
} from "@app/lib/models";
import { MembershipInvitationType } from "@app/types/membership_invitation";
import { UserType, WorkspaceType } from "@app/types/user";

export async function getWorkspaceInfos(
  wId: string
): Promise<WorkspaceType | null> {
  const workspace = await Workspace.findOne({
    where: {
      sId: wId,
    },
  });

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    allowedDomain: workspace.allowedDomain,
    role: "none",
  };
}

/**
 * Returns the users members of the workspace associated with the authenticator (without listing
 * their own workspaces).
 * @param auth Authenticator
 * @returns UserType[] members of the workspace
 */
export async function getMembers(auth: Authenticator): Promise<UserType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const memberships = await Membership.findAll({
    where: {
      workspaceId: owner.id,
    },
  });

  const users = await User.findAll({
    where: {
      id: memberships.map((m) => m.userId),
    },
  });

  return users.map((u) => {
    const m = memberships.find((m) => m.userId === u.id);
    let role = "none" as RoleType;
    if (m) {
      switch (m.role) {
        case "admin":
        case "builder":
        case "user":
          role = m.role;
          break;
        default:
          role = "none";
      }
    }

    return {
      id: u.id,
      provider: u.provider,
      providerId: u.providerId,
      username: u.username,
      email: u.email,
      name: u.name,
      image: null,
      workspaces: [{ ...owner, role }],
      isDustSuperUser: u.isDustSuperUser,
    };
  });
}

/**
 * Returns the pending inviations associated with the authenticator's owner workspace.
 * @param auth Authenticator
 * @returns MenbershipInvitation[] members of the workspace
 */
export async function getPendingInvitations(
  auth: Authenticator
): Promise<MembershipInvitationType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const invitations = await MembershipInvitation.findAll({
    where: {
      workspaceId: owner.id,
      status: "pending",
    },
  });

  return invitations.map((i) => {
    return {
      id: i.id,
      status: i.status,
      inviteEmail: i.inviteEmail,
    };
  });
}
