import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  Transaction,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { Workspace } from "@app/lib/models/workspace";

export class Plan extends Model<
  InferAttributes<Plan>,
  InferCreationAttributes<Plan>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare code: string; // unique
  declare name: string;
  declare stripeProductId: string | null;
  declare billingType: "fixed" | "monthly_active_users" | "free";

  // workspace limitations
  declare maxMessages: number;
  declare maxUsersInWorkspace: number;
  declare isSlackbotAllowed: boolean;
  declare isManagedSlackAllowed: boolean;
  declare isManagedNotionAllowed: boolean;
  declare isManagedGoogleDriveAllowed: boolean;
  declare isManagedGithubAllowed: boolean;
  declare maxDataSourcesCount: number;
  declare maxDataSourcesDocumentsCount: number;
  declare maxDataSourcesDocumentsSizeMb: number;
}
Plan.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stripeProductId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    billingType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "fixed",
      validate: {
        isIn: [["fixed", "monthly_active_users", "free"]],
      },
    },
    maxMessages: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    maxUsersInWorkspace: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isSlackbotAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedSlackAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedNotionAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedGoogleDriveAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedGithubAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    maxDataSourcesCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: -1,
    },
    maxDataSourcesDocumentsCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: -1,
    },
    maxDataSourcesDocumentsSizeMb: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
    },
  },
  {
    modelName: "plan",
    sequelize: front_sequelize,
    indexes: [{ unique: true, fields: ["code"] }],
  }
);

export class Subscription extends Model<
  InferAttributes<Subscription>,
  InferCreationAttributes<Subscription>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string; // unique
  declare status: "active" | "ended";
  declare startDate: Date;
  declare endDate: Date | null;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare workspace: NonAttribute<Workspace>;

  declare planId: ForeignKey<Plan["id"]>;
  declare plan: NonAttribute<Plan>;

  declare stripeCustomerId: string | null;
  declare stripeSubscriptionId: string | null;
}
Subscription.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["active", "ended"]],
      },
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stripeSubscriptionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "subscription",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["sId"] },
      { fields: ["workspaceId", "status"] },
    ],
  }
);
// Define a hook to ensure there's only one active subscription for each workspace
Subscription.addHook(
  "beforeCreate",
  "enforce_single_active_subscription",
  async (subscription: Subscription, options: { transaction: Transaction }) => {
    if (subscription.status === "active") {
      // Check if there's already an active subscription for the same workspace
      const existingActiveSubscription = await Subscription.findOne({
        where: {
          workspaceId: subscription.workspaceId,
          status: "active",
        },
        transaction: options.transaction, // Include the transaction in your query
      });

      if (existingActiveSubscription) {
        throw new Error(
          "An active subscription already exists for this workspace."
        );
      }
    }
  }
);

// Plan <> Subscription relationship: attribute "planId" in Subscription
Plan.hasMany(Subscription, {
  foreignKey: { name: "planId", allowNull: false },
  onDelete: "CASCADE",
});
Subscription.belongsTo(Plan, {
  foreignKey: { name: "planId", allowNull: false },
});

// Subscription <> Workspace relationship: attribute "workspaceId" in Subscription
Workspace.hasMany(Subscription, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
Subscription.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});
