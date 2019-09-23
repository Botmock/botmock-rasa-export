import * as utils from "@botmock-api/utils";
import uuid from "uuid/v4";
import { writeFile, mkdirp } from "fs-extra";
import { stringify as toYAML } from "yaml";
import { EventEmitter } from "events";
import { join } from "path";
import { EOL } from "os";
import * as Assets from "./types";
import { genIntents } from "./nlu";
import { convertIntentStructureToStories } from "./storiesFromIntents";

export type IntentMap = Map<string, string[]>;

type Templates = { [actionName: string]: { [type: string]: any } };

interface Config {
  readonly outputDir: string;
  readonly projectData: Assets.CollectedResponses
}

export default class FileWriter extends EventEmitter {
  private outputDir: string;
  private projectData: Assets.CollectedResponses;
  private intentMap: IntentMap;
  private messageCollector: Function;
  private getMessage: Function;
  private init: string;
  private stories: { [intentName: string]: string[] };
  /**
   * Creates instance of FileWriter
   * @param config configuration object containing an outputDir to hold generated
   * files, and projectData for the original botmock flow project
   */
  constructor(config: Config) {
    super();
    this.init = new Date().toLocaleString();
    this.outputDir = config.outputDir;
    this.projectData = config.projectData;
    this.getMessage = (id: string): Assets.Message => (
      this.projectData.board.board.messages.find((message: Assets.Message) => message.message_id === id)
    );
    this.intentMap = utils.createIntentMap(this.projectData.board.board.messages, this.projectData.intents);
    this.messageCollector = utils.createMessageCollector(this.intentMap, this.getMessage);
    this.stories = convertIntentStructureToStories({
      intents: this.projectData.intents,
      intentMap: this.intentMap,
      messageCollector: this.messageCollector,
      messages: this.projectData.board.board.messages
    });
  }
  /**
   * Gets array containing the unique action names in the project
   * @returns string[]
   */
  private getUniqueActionNames(): string[] {
    return Object.keys(
      Object.values(this.stories)
        .reduce((acc, values: string[]) => {
          return {
            ...acc,
            ...values.reduce((accu, value) => ({
              ...accu,
              [value]: {}
            }), {})
          }
        }, {}))
      .map(action => `utter_${action}`);
  }
  /**
   * Creates object describing templates for the project
   * @returns Templates
   */
  private createTemplates(): Templates {
    const templateList = this.getUniqueActionNames()
      .reduce((acc, actionName: string) => {
        const PREFIX_LENGTH = 6;
        const message = this.getMessage(actionName.slice(PREFIX_LENGTH));
        const collectedMessages = this.messageCollector(message.next_message_ids).map(this.getMessage)
        return {
          ...acc,
          [actionName]: [message, ...collectedMessages].reduce((accu, message: Assets.Message) => {
            let type: string;
            let payload: any;
            switch (message.message_type) {
              case "jump":
                const { value, label, jumpType } = JSON.parse(message.payload.selectedResult)
                if (jumpType === "node") {
                  payload = `jumped to block ${label}`;
                } else {
                  payload = `jumped to project ${label}`;
                }
                type = "text";
                break;
              case "image":
                type = "image";
                payload = message.payload.image_url;
                break;
              case "button":
              case "quick_replies":
                type = "buttons";
                payload = (message.payload[message.message_type] || []).map(({ title, payload }) => ({
                  title,
                  payload
                }));
                break;
              // case "generic":
              // case "list":
              // case "api":
              default:
                const payloadValue = message.payload[message.message_type];
                type = "text";
                payload = typeof payloadValue !== "string" ? JSON.stringify(payloadValue) : payloadValue;
            }
            let value = payload ||
              `${message.payload[message.message_type]
                ? message.payload[message.message_type].replace(/\n/g, EOL)
                : message.payload[message.message_type]
              }`;
            if (typeof value === "string") {
              value = utils.symmetricWrap(value, { l: "{", r: "}" });
            }
            return {
              ...accu,
              [type || message.message_type]: value
            };
          })
        }
      }, {});
      return templateList;
  }
  /**
   * Writes yml domain file
   * @returns Promise<void>
   */
  public async createYml(): Promise<void> {
    const outputFilePath = join(this.outputDir, "domain.yml");
    const firstLine = `# generated ${this.init}`;
    const data = toYAML({
      intents: this.projectData.intents.map((intent: Assets.Intent) => intent.name),
      entities: this.projectData.variables.map((entity: Assets.Variable) => entity.name.replace(/\s/, "")),
      actions: this.getUniqueActionNames(),
      templates: this.createTemplates()
    });
    return await writeFile(
      outputFilePath,
      `${firstLine}${EOL}${data}`
    );
  }
/**
 * Writes intent markdown file
 * @returns Promise<void>
 */
  private async writeIntentFile(): Promise<void> {
    const { intents, entities } = this.projectData;
    const outputFilePath = join(this.outputDir, "data", "nlu.md");
    await mkdirp(join(this.outputDir, "data"));
    await writeFile(
      outputFilePath,
      genIntents({ intents, entities })
    );
  }
  /**
   * Gets the lineage of intents implied by a given message id
   * @param messageId message id of a message connected by an intent
   * @returns string[]
   */
  private getIntentLineageForMessage(messageId: string): string[] {
    const { getMessage, intentMap, projectData } = this;
    const context: string[] = [];
    const seenIds: string[] = [];
    (function unwindFromMessageId(messageId: string) {
      const { previous_message_ids: prevIds } = getMessage(messageId);
      let messageFollowingIntent: any;
      if ((messageFollowingIntent = prevIds.find(prev => intentMap.get(prev.message_id)))) {
        const { name: nameOfIntent } = projectData.intents.find(intent => (
          intent.id === intentMap.get(messageFollowingIntent.message_id)[0]
        ));
        if (typeof nameOfIntent !== "undefined") {
          context.push(nameOfIntent);
        }
      } else {
        for (const { message_id: prevMessageId } of prevIds) {
          if (!seenIds.includes(prevMessageId)) {
            seenIds.push(prevMessageId);
            unwindFromMessageId(prevMessageId);
          }
        }
      }
    })(messageId);
    return context;
  }
  /**
   * Writes stories markdown file. Each story is a possible path of intents that
   * leads to a message that is directly connected by an intent. In Rasa's language
   * these are "paths"; each intent in a path is part of the lineage of intents
   * leading to the particular message that follows from an intent; each action
   * is a content block in the relevant group between the intents.
   * @returns Promise<void>
   */
  private async writeStoriesFile(): Promise<void> {
    const outputFilePath = join(this.outputDir, "data", "stories.md");
    const OPENING_LINE = `<!-- generated ${new Date().toLocaleString()} -->`;
    const data = Array.from(this.intentMap.keys())
      .reduce((acc, idOfMessageConnectedByIntent: string) => {
        const lineage: string[] = [
          ...this.getIntentLineageForMessage(idOfMessageConnectedByIntent),
          ...this.intentMap.get(idOfMessageConnectedByIntent).map((intentId: string) => (
            this.projectData.intents.find((intent: Assets.Intent) => intent.id === intentId).name
          ))
        ];
        const path: string[] = lineage.map((intentName: string) => {
          const actionsUnderIntent = this.stories[intentName].map((actionName: string) => (
            `  - utter_${actionName}`
          )).join(EOL);
          return `* ${intentName}${EOL}${actionsUnderIntent}`;
        });
        const storyName = `## ${uuid()}`;
        return acc + EOL + storyName + EOL + path.join(EOL) + EOL;
      }, OPENING_LINE);
    await writeFile(outputFilePath, data);
  }
  /**
   * Writes markdown files within outputDir
   * @returns Promise<void>
   */
  public async createMd(): Promise<void> {
    await this.writeIntentFile();
    await this.writeStoriesFile();
  }
}
