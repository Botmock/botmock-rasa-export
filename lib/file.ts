import uuid from "uuid/v4";
import * as flow from "@botmock-api/flow";
import { wrapEntitiesWithChar } from "@botmock-api/text";
import { writeFile, mkdirp, copyFileSync } from "fs-extra";
import { stringify as toYAML } from "yaml";
import { join } from "path";
import { EOL } from "os";
import * as nlu from "./nlu";

namespace Rasa {
  export enum SlotTypes {
    text = "text",
  }
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
  private boardStructureByMessages: flow.SegmentizedStructure;
  private stories: { [intentName: string]: string[] };
  private static instance: FileWriter;
  /**
   * Creates instance of FileWriter
   * @param config configuration object
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
        return {
          ...acc,
          // @ts-ignore
          [actionName]: [message, ...this.gatherMessagesUpToNextIntent(message)].reduce((accu, message: flow.Message) => {
            let payload: string | {} | void = {};
            switch (message.message_type) {
              case "delay":
                // @ts-ignore
                payload = `waiting for ${message.payload?.show_for} ms`;
                break;
              case "api":
                break;
              case "jump":
                const { label, jumpType } = JSON.parse(message.payload?.selectedResult)
                switch (jumpType) {
                  case Botmock.JumpTypes.node:
                    payload = `jumped to block ${label}`;
                    break;
                  case Botmock.JumpTypes.project:
                    payload = `jumped to project ${label}`;
                    break;
                }
                break;
              case "image":
                payload = message.payload?.image_url;
                break;
              case "button":
              case "quick_replies":
                const key = message.payload?.hasOwnProperty("buttons")
                  ? "buttons"
                  : "quick_replies";
                // @ts-ignore
                payload = message.payload[key].map(({ title, payload }: any) => ({ buttons: { title, payload } }));
                break;
              default:
                // @ts-ignore
                const payloadValue = message.payload[message.message_type];
                payload = typeof payloadValue !== "string" ? JSON.stringify(payloadValue) : payloadValue;
            }
            return [
              ...accu,
              ...(typeof payload === "string"
                ? [wrapEntitiesWithChar(payload, "{")]
                : Array.isArray(payload) ? payload : Array.of(payload)
              )
            ];
          }, [])
        }
      }, {});
  }
  /**
   * Represent all required slots as an array of objects able to be consumed as yml
   */
  private representRequiredSlots(): {}[] {
    const uniqueNamesOfRequiredSlots = Array.from(this.representRequirementsForIntents())
      .reduce((acc, pair: [string, any]) => {
        const [, requiredSlots] = pair;
        return {
          ...acc,
          ...requiredSlots.reduce((accu: any, slot: flow.Slot) => {
            const variable = this.projectData.variables.find(variable => variable.id === slot.variable_id);
            if (!variable) {
              return accu;
            }
            return {
              ...accu,
              [variable.name]: variable.default_value || void 0,
            }
          }, {})
        };
      }, {});
    return Object.entries(uniqueNamesOfRequiredSlots)
      .map(([slotName, defaultValue]) => ({ [slotName]: { type: Rasa.SlotTypes.text, initial_value: defaultValue } }));
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
      templates: this.createTemplates(),
      slots: this.representRequiredSlots(),
    });
    return await writeFile(outputFilePath, `${firstLine}${EOL}${data}`);
  }
  /**
   * Creates markdown content for intents
   * @returns file contents as a string
   */
  private generateNLUFileContent(): string {
    const { intents, entities } = this.projectData;
    return `${intents.map((intent: flow.Intent, i: number) => {
      // @ts-ignore
      const { id, name, utterances: examples, updated_at: { date: timestamp } } = intent;
      return `${i !== 0 ? EOL : ""}<!-- ${timestamp} | ${id} -->
## intent:${name.toLowerCase()}
${examples.map((example: any) => nlu.generateExampleContent(example, entities)).join(EOL)}`;
    }).join(EOL)}
${entities.map(entity => nlu.generateEntityContent(entity)).join(EOL)}`;
  }
  /**
   * Writes intent markdown file
   */
  private async writeIntentFile(): Promise<void> {
    const outputFilePath = join(this.outputDir, "data", "nlu.md");
    await mkdirp(join(this.outputDir, "data"));
    await writeFile(outputFilePath, this.generateNLUFileContent());
  }
  /**
   * Gets the lineage of intents implied by a given message id
   * @param messageId message id of a message connected by an intent
   */
  private getIntentLineageForMessage(messageId: string): string[] {
    const self = this;
    const context: string[] = [];
    const seenIds: string[] = [];
    (function unwindFromMessageId(messageId: string) {
      const { previous_message_ids: previousMessageIds } = self.getMessage(messageId) as flow.Message;
      if (typeof previousMessageIds !== "undefined") {
        let messageFollowingIntent: any;
        if ((messageFollowingIntent = previousMessageIds.find(m => self.boardStructureByMessages.get(m.message_id)))) {
          const [idOfConnectedItent] = self.boardStructureByMessages.get(messageFollowingIntent.message_id) as [string];
          const { name: nameOfIntent } = self.getIntent(idOfConnectedItent) as flow.Intent;
          if (typeof nameOfIntent !== "undefined") {
            context.push(nameOfIntent);
          }
        } else {
          for (const { message_id: prevMessageId } of previousMessageIds) {
            if (!seenIds.includes(prevMessageId)) {
              seenIds.push(prevMessageId);
              unwindFromMessageId(prevMessageId);
            }
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
   */
  private async writeStoriesFile(): Promise<void> {
    const data = Array.from(this.boardStructureByMessages.keys())
      .reduce((acc, idOfMessageConnectedByIntent: string) => {
        const idsOfConnectedIntents = this.boardStructureByMessages.get(idOfMessageConnectedByIntent) as any[];
        const lineage = [
          ...this.getIntentLineageForMessage(idOfMessageConnectedByIntent),
          ...idsOfConnectedIntents.map((intentId: string) => {
            const { name } = this.getIntent(intentId) as flow.Intent;
            return name;
          }),
        ];
        const paths: string[] = lineage.map((intentName: string) => {
          const { id: idOfIntent } = this.projectData.intents.find(intent => intent.name === intentName) as flow.Intent;
          // @ts-ignore
          const [firstRequiredSlot] = this.representRequirementsForIntents().get(idOfIntent);
          let slot: string = "";
          if (firstRequiredSlot) {
            const variable = this.projectData.variables.find(variable => variable.id === firstRequiredSlot.variable_id);
            slot = `{"${variable?.name}": "${variable?.default_value}"}`;
          }
          const actionsUnderIntent = this.stories[intentName].map((actionName: string) => (
            `  - utter_${actionName}`
          )).concat(slot ? `  - slot${slot}`: []).join(EOL);
          return `* ${intentName.replace(/\s/g, "").toLowerCase()}${slot}${EOL}${actionsUnderIntent}`;
        });
        const storyName = `## ${uuid()}`;
        return acc + EOL + storyName + EOL + paths.join(EOL) + EOL;
      }, `<!-- generated ${new Date().toLocaleString()} -->`);
    await writeFile(join(this.outputDir, "data", "stories.md"), data);
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
