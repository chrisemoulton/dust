import {
  AgentConfiguration,
  AgentDataSourceConfiguration,
  AgentDustAppRunAction,
  AgentDustAppRunConfiguration,
  AgentGenerationConfiguration,
  AgentMessage,
  AgentRetrievalAction,
  AgentRetrievalConfiguration,
  App,
  Clone,
  Conversation,
  ConversationParticipant,
  Dataset,
  DataSource,
  DocumentTrackerChangeSuggestion,
  EventSchema,
  ExtractedEvent,
  Key,
  Membership,
  MembershipInvitation,
  Mention,
  Message,
  MessageReaction,
  Plan,
  Provider,
  RetrievalDocument,
  RetrievalDocumentChunk,
  Run,
  Subscription,
  TrackedDocument,
  User,
  UserMessage,
  UserMetadata,
  Workspace,
  XP1Run,
  XP1User,
} from "@app/lib/models";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import { ContentFragment } from "@app/lib/models/assistant/conversation";

async function main() {
  await User.sync({ alter: true });
  await UserMetadata.sync({ alter: true });
  await Workspace.sync({ alter: true });
  await Membership.sync({ alter: true });
  await MembershipInvitation.sync({ alter: true });
  await App.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  await Clone.sync({ alter: true });
  await Key.sync({ alter: true });
  await DataSource.sync({ alter: true });
  await Run.sync({ alter: true });
  await TrackedDocument.sync({ alter: true });
  await EventSchema.sync({ alter: true });
  await ExtractedEvent.sync({ alter: true });
  await DocumentTrackerChangeSuggestion.sync({ alter: true });

  await Plan.sync({ alter: true });
  await Subscription.sync({ alter: true });

  await AgentDustAppRunConfiguration.sync({ alter: true });
  await AgentDustAppRunAction.sync({ alter: true });

  await AgentGenerationConfiguration.sync({ alter: true });
  await AgentRetrievalConfiguration.sync({ alter: true });
  await AgentDataSourceConfiguration.sync({ alter: true });
  await AgentConfiguration.sync({ alter: true });
  await GlobalAgentSettings.sync({ alter: true });

  await AgentRetrievalAction.sync({ alter: true });
  await RetrievalDocument.sync({ alter: true });
  await RetrievalDocumentChunk.sync({ alter: true });

  await Conversation.sync({ alter: true });
  await ConversationParticipant.sync({ alter: true });
  await UserMessage.sync({ alter: true });
  await AgentMessage.sync({ alter: true });
  await ContentFragment.sync({ alter: true });
  await Message.sync({ alter: true });
  await MessageReaction.sync({ alter: true });
  await Mention.sync({ alter: true });

  await XP1User.sync({ alter: true });
  await XP1Run.sync({ alter: true });

  process.exit(0);
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
