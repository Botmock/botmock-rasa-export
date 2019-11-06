import { wrapEntitiesWithChar } from "@botmock-api/text";
import * as utils from "@botmock-api/utils";
import * as flow from "@botmock-api/flow";
import uuid from "uuid/v4";
import { writeFile, mkdirp } from "fs-extra";
import { stringify as toYAML } from "yaml";
import { join } from "path";
import { EOL } from "os";
import { genIntents } from "./nlu";
import { convertIntentStructureToStories } from "./intent";

export namespace Rasa {}

export type ProjectData<T> = T extends Promise<infer K> ? K : any;

export type Templates = { [actionName: string]: { [type: string]: any } };

interface IConfig {
  readonly outputDir: string;
  readonly projectData: unknown;
}

export default class FileWriter extends flow.AbstractProject {
  private outputDir: string;
  private intentMap: any;
  private messageCollector: Function;
  private stories: { [intentName: string]: string[] };
  /**
   * Creates instance of FileWriter
   * @param config configuration object containing an outputDir to hold generated
   * files, and projectData for the original botmock flow project
   */
  constructor(config: IConfig) {
    super({ projectData: config.projectData as ProjectData<typeof config.projectData> });
    this.outputDir = config.outputDir;
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
   * @returns unique action names
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
    const actionNameContent = this.getUniqueActionNames()
      .reduce((acc, actionName: string) => {
        const PREFIX_LENGTH = 6;
        const message = this.getMessage(actionName.slice(PREFIX_LENGTH));
        // @ts-ignore
        const collectedMessages = this.messageCollector(message.next_message_ids).map(this.getMessage);
        return {
          ...acc,
          [actionName]: [message, ...collectedMessages].reduce((accu, message: flow.Message) => {
            let payload: string | {};
            switch (message.message_type) {
              // case "api":
              case "jump":
                const { value, label, jumpType } = JSON.parse(message.payload.selectedResult)
                if (jumpType === "node") {
                  payload = `jumped to block ${label}`;
                } else {
                  payload = `jumped to project ${label}`;
                }
                break;
              case "image":
                payload = message.payload.image_url;
                break;
              case "button":
              case "quick_replies":
                payload = (message.payload.quick_replies || message.payload.buttons)
                  .map(({ title, payload }) => ({ buttons: { title, payload } }));
                break;
              default:
                const payloadValue = message.payload[message.message_type];
                payload = typeof payloadValue !== "string" ? JSON.stringify(payloadValue) : payloadValue;
            }
            return [
              ...accu,
              (typeof payload === "string"
                ? wrapEntitiesWithChar(payload, "{")
                : JSON.stringify(payload, null, 2)
              )
            ];
          }, [])
        }
      }, {});
    // console.log(actionNameContent);
    return actionNameContent;
  }
  /**
   * Writes yml domain file
   * @returns Promise<void>
   */
  private async createYml(): Promise<void> {
    const outputFilePath = join(this.outputDir, "domain.yml");
    const firstLine = `# generated ${new Date().toLocaleString()}`;
    const data = toYAML({
      intents: this.projectData.intents.map((intent: flow.Intent) => intent.name),
      // @ts-ignore
      entities: this.projectData.variables.map((entity: flow.Variable) => entity.name.replace(/\s/, "")),
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
      // @ts-ignore
      const { previous_message_ids: prevIds } = getMessage(messageId);
      let messageFollowingIntent: any;
      if ((messageFollowingIntent = prevIds.find(prev => intentMap.get(prev.message_id)))) {
        const { name: nameOfIntent } = projectData.intents.find((intent: flow.Intent) => (
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
            this.projectData.intents.find((intent: flow.Intent) => intent.id === intentId).name
          ))
        ];
        const path: string[] = lineage.map((intentName: string) => {
          const actionsUnderIntent = this.stories[intentName].map((actionName: string) => (
            `  - utter_${actionName}`
          )).join(EOL);
          return `* ${intentName.replace(/\s/g, "").toLowerCase()}${EOL}${actionsUnderIntent}`;
        });
        const storyName = `## ${uuid()}`;
        return acc + EOL + storyName + EOL + path.join(EOL) + EOL;
      }, OPENING_LINE);
    await writeFile(outputFilePath, data);
  }
  /**
   * Writes markdown files within outputDir
   */
  private async createMd(): Promise<void> {
    await this.writeIntentFile();
    await this.writeStoriesFile();
  }
  /**
   * Writes all files produced by script
   */
  public async write(): Promise<void> {
    await this.createMd();
    await this.createYml();
  }
}
