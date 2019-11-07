import uuid from "uuid/v4";
import * as flow from "@botmock-api/flow";
import { wrapEntitiesWithChar } from "@botmock-api/text";
import { writeFile, mkdirp } from "fs-extra";
import { stringify as toYAML } from "yaml";
import { join } from "path";
import { EOL } from "os";
import { genIntents } from "./nlu";

namespace Rasa {
  export type Template = {};
  export type Story = {};
  export type Action = {};
}

namespace Botmock {
  export enum JumpTypes {
    node = "node",
    project = "project",
  }
}

export type ProjectData<T> = T extends Promise<infer K> ? K : any;

interface IConfig {
  readonly outputDir: string;
  readonly projectData: unknown;
}

export default class FileWriter extends flow.AbstractProject {
  private outputDir: string;
  private intentMap: any;
  private boardStructureByMessages: flow.SegmentizedStructure;
  private stories: { [intentName: string]: string[] };
  private static instance: FileWriter;
  /**
   * Creates instance of FileWriter
   * @param config configuration object containing an outputDir to hold generated
   * files, and projectData for the original botmock flow project
   */
  private constructor(config: IConfig) {
    super({ projectData: config.projectData as ProjectData<typeof config.projectData> });
    this.outputDir = config.outputDir;
    this.boardStructureByMessages = this.segmentizeBoardFromMessages();
    this.stories = this.createStoriesFromIntentStructure();
  }
  /**
   * Get singleton class
   * @returns only existing instance of the class
   */
  public static getInstance(config: IConfig): FileWriter {
    if (!FileWriter.instance) {
      FileWriter.instance = new FileWriter(config);
    }
    return FileWriter.instance;
  }
  /**
   * Gets array containing the unique action names in the project
   * @returns unique action names
   */
  private getUniqueActionNames(): ReadonlyArray<string> {
    return Object.keys(
      Object.values(this.stories)
        .reduce((acc, values: string[]) => {
          return {
            ...acc,
            ...values.reduce((accu, value) => ({
              ...accu,
              [value]: void 0
            }), {})
          }
        }, {}))
      .map(action => `utter_${action}`);
  }
  /**
   * Creates object associating intent names with the ids of blocks that flow from them
   * @returns stories as an object
   */
  private createStoriesFromIntentStructure(): { [intentName: string]: string[] } {
    const { intents } = this.projectData;
    return Array.from(this.boardStructureByMessages).reduce(
      (acc, [idOfMessageConnectedByIntent, idsOfConnectedIntents]: [string, string[]]) => ({
        ...acc,
        ...idsOfConnectedIntents.reduce((accu, id: string) => {
          const message: any = this.getMessage(idOfMessageConnectedByIntent);
          const intent = intents.find(intent => intent.id === id) as flow.Intent;
          if (typeof intent !== "undefined") {
            return {
              ...accu,
              [intent.name]: [message, ...this.gatherMessagesUpToNextIntent(message)]
                .map(message => message.message_id)
            };
          } else {
            return accu;
          }
        }, {})
      }),
      {}
    );
  }
  /**
   * Creates object describing templates for the project
   * @returns nested object containing content block data
   */
  private createTemplates(): { [actionName: string]: { [type: string]: any } } {
    return this.getUniqueActionNames()
      .reduce((acc, actionName: string) => {
        const ACTION_PREFIX_LENGTH = 6;
        const message = this.getMessage(actionName.slice(ACTION_PREFIX_LENGTH)) as flow.Message;
        // console.log(message);
        return {
          ...acc,
          // @ts-ignore
          [actionName]: [message, ...this.gatherMessagesUpToNextIntent(message)].reduce((accu, message: flow.Message) => {
            let payload: string | {};
            switch (message.message_type) {
              // case "delay":
              // case "api":
              case "jump":
                // @ts-ignore
                const { label, jumpType } = JSON.parse(message.payload.selectedResult)
                if (jumpType === "node") {
                  payload = `jumped to block ${label}`;
                } else {
                  payload = `jumped to project ${label}`;
                }
                break;
              case "image":
                // @ts-ignore
                payload = message.payload.image_url;
                break;
              case "button":
              case "quick_replies":
                const key = (message.payload as object).hasOwnProperty("buttons")
                  ? "buttons"
                  : "quick_replies";
                // @ts-ignore
                payload = message.payload[key].map(({ title, payload }) => ({ buttons: { title, payload } }));
                break;
              default:
                // @ts-ignore
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
  }
  /**
   * Writes yml domain file
   */
  private async createYml(): Promise<void> {
    const outputFilePath = join(this.outputDir, "domain.yml");
    const firstLine = `# generated ${new Date().toLocaleString()}`;
    const data = toYAML({
      intents: this.projectData.intents.map(intent => intent.name),
      entities: this.projectData.variables.map(variable => variable.name.replace(/\s/, "")),
      actions: this.getUniqueActionNames(),
      templates: this.createTemplates()
    });
    return await writeFile(outputFilePath, `${firstLine}${EOL}${data}`);
  }
/**
 * Writes intent markdown file
 */
  private async writeIntentFile(): Promise<void> {
    const { intents, entities } = this.projectData;
    const outputFilePath = join(this.outputDir, "data", "nlu.md");
    await mkdirp(join(this.outputDir, "data"));
    await writeFile(outputFilePath, genIntents({ intents, entities }));
  }
  /**
   * Gets the lineage of intents implied by a given message id
   * @param messageId message id of a message connected by an intent
   */
  private getIntentLineageForMessage(messageId: string): string[] {
    const { getMessage, intentMap, projectData } = this;
    const context: string[] = [];
    const seenIds: string[] = [];
    (function unwindFromMessageId(messageId: string) {
      // @ts-ignore
      const { previous_message_ids: prevIds } = getMessage(messageId);
      let messageFollowingIntent: any;
      // @ts-ignore
      if ((messageFollowingIntent = prevIds.find(prev => intentMap.get(prev.message_id)))) {
        // @ts-ignore
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
    const data = Array.from(this.boardStructureByMessages.keys())
      .reduce((acc, idOfMessageConnectedByIntent: string) => {
        const lineage: string[] = [
          ...this.getIntentLineageForMessage(idOfMessageConnectedByIntent),
          ...this.intentMap.get(idOfMessageConnectedByIntent).map((intentId: string) => (
            // @ts-ignore
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
