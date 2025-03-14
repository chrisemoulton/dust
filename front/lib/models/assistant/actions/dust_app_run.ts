import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { DustAppParameters } from "@app/types/assistant/actions/dust_app_run";

/**
 * Action DustAppRun Configuration
 */
export class AgentDustAppRunConfiguration extends Model<
  InferAttributes<AgentDustAppRunConfiguration>,
  InferCreationAttributes<AgentDustAppRunConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare appWorkspaceId: string;
  declare appId: string;
}

AgentDustAppRunConfiguration.init(
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
    appWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "agent_dust_app_run_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
    ],
    sequelize: front_sequelize,
  }
);

/**
 * DustAppRun Action
 */
export class AgentDustAppRunAction extends Model<
  InferAttributes<AgentDustAppRunAction>,
  InferCreationAttributes<AgentDustAppRunAction>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustAppRunConfigurationId: string;

  declare appWorkspaceId: string;
  declare appId: string;
  declare appName: string;

  declare params: DustAppParameters;
  declare output: unknown | null;
}
AgentDustAppRunAction.init(
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

    dustAppRunConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    appWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    params: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    output: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    modelName: "agent_dust_app_run_action",
    sequelize: front_sequelize,
  }
);
