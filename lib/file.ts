import uuid from "uuid/v4";
import * as flow from "@botmock-api/flow";
// import { wrapEntitiesWithChar } from "@botmock-api/text";
import { stringify as toYAML } from "yaml";
import { writeFile, mkdirp } from "fs-extra";
// @ts-ignore
import { default as snakeCase } from "to-snake-case";
import { join } from "path";
import { EOL } from "os";
import * as nlu from "./nlu";
import { Intent } from "@botmock-api/flow";
import { v4 } from "uuid";

namespace Rasa {
  export enum SlotTypes {
    text = "text",
  }
  export type Template = { [actionName: string]: { [type: string]: any; }; };
  export enum TemplateTypes {
    TEXT = "text",
    IMAGE = "image",
    BUTTONS = "buttons",
  }
}

namespace Botmock {
  export interface Message {
    message_id: string;
    message_type: string;
    previous_message_ids: any[];
    next_message_ids: any[];
    is_root: boolean;
    payload: Partial<{
      workflow_index: number;
      nodeName: string;
      context: [];
      elements: [];
      text: string;
      quick_replies: any[];
      buttons: any[];
      selectedResult: any;
      image_url: string;
    }>;
  };
  export enum JumpTypes {
    node = "node",
    project = "project",
  }
  export enum MessageTypes {
    GENERIC = "generic",
    DELAY = "delay",
    JUMP = "jump",
    WEBVIEW = "webview",
    IMAGE = "image",
    BUTTON = "button",
    QUICK_REPLIES = "quick_replies",
  }
}

export type ProjectData<T> = T extends Promise<infer K> ? K : any;

interface IConfig {
  readonly outputDir: string;
  readonly projectData: unknown;
}

export default class FileWriter extends flow.AbstractProject {
  private welcomeIntent!: flow.Intent;
  private outputDir: string;
  private boardStructureByMessages: flow.SegmentizedStructure;
  private stories: { [intentName: string]: string[]; };
  private static instance: FileWriter;
  private constructor(config: IConfig) {
    super({ projectData: config.projectData as ProjectData<typeof config.projectData> });
    this.outputDir = config.outputDir;
    this.boardStructureByMessages = this.segmentizeBoardFromMessages();
    for (const message of this.projectData.board.board.messages) {
      const [rootParentId] = message.previous_message_ids?.filter(previous => {
        const previousMessage = this.getMessage(previous.message_id) as Botmock.Message;
        return previousMessage.is_root;
      }).map(previous => previous.message_id) as any[];
      if (rootParentId) {
        if (!this.boardStructureByMessages.get(rootParentId)) {
          this.welcomeIntent = {
            id: v4(),
            name: "welcome",
            utterances: [{ text: "hi", variables: [] }],
            created_at: {
              date: new Date().toISOString(),
              timezone_type: 3,
              timezone: 'UTC'
            },
            updated_at: {
              date: new Date().toISOString(),
              timezone_type: 3,
              timezone: 'UTC'
            },
            is_global: false,
            slots: null,
          } as flow.Intent;
          this.boardStructureByMessages.set(rootParentId, [this.welcomeIntent.id]);
        }
      }
    }
    this.stories = this.createStoriesFromIntentStructure(this.boardStructureByMessages);
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
        .reduce((actions, values: string[]) => {
          return {
            ...actions,
            ...values.reduce((innerActions, value) => ({
              ...innerActions,
              [value]: void 0,
            }), {})
          };
        }, {}))
      .map(action => `utter_${action}`);
  }
  /**
   * Creates object of intent names -> blocks they are connected to.
   * @returns stories as an object
   */
  private createStoriesFromIntentStructure(boardStructure: Map<string, string[]>): { [intentName: string]: string[]; } {
    const { intents } = this.projectData;
    type Entry = [string, string[]];
    return Array.from(boardStructure)
      .reduce((connectedIntents, [messageId, connectedIntentIds]: Entry) => ({
        ...connectedIntents,
        ...connectedIntentIds.reduce((innerConnectedIntents, id: string) => {
          const message = this.getMessage(messageId) as Botmock.Message;
          const intent = intents.find(intent => intent.id === id) as flow.Intent;
          if (typeof intent !== "undefined") {
            return {
              ...innerConnectedIntents,
              [intent.name]: [
                message,
                ...this.gatherMessagesUpToNextIntent(message as Botmock.Message)
              ].map(message => message.message_id)
            };
          } else if (message.is_root) {
            return {
              ...innerConnectedIntents,
              [this.welcomeIntent.name]: [
                message,
                ...this.gatherMessagesUpToNextIntent(message as Botmock.Message)
              ].map(message => message.message_id),
            };
          } else {
            return innerConnectedIntents;
          }
        }, {})
      }), {});
  }
  /**
   * Creates object describing responses for the project
   * @returns nested object containing content block data
   */
  private getTemplates(): Rasa.Template {
    return this.getUniqueActionNames()
      .reduce((templates, actionName: string) => {
        const message = this.getMessage(actionName.slice("utter_".length)) as flow.Message;
        return {
          ...templates,
          [actionName]: [message, ...this.gatherMessagesUpToNextIntent(message)]
            .reduce((responses: object, response: flow.Message) => {
              let key, value: string | any;
              switch (response.message_type) {
                case "text":
                  [key, value] = [Rasa.TemplateTypes.TEXT, response.payload?.text as string];
                  break;
                case "image":
                  [key, value] = [Rasa.TemplateTypes.IMAGE, response.payload?.image_url as string];
                  break;
                case "button":
                  [key, value] = [
                    Rasa.TemplateTypes.BUTTONS,
                    response.payload?.buttons?.map(button => ({
                      title: button.title,
                      payload: button.title.trim(),
                    })) as object[],
                  ];
                  break;
                case "quick_replies":
                  [key, value] = [
                    Rasa.TemplateTypes.BUTTONS,
                    response.payload?.quick_replies?.map(reply => ({
                      title: reply.title,
                      payload: reply.title.trim(),
                    })) as object[],
                  ];
                  break;
                default:
                  [key, value] = [Rasa.TemplateTypes.TEXT, response.payload?.nodeName as string];
                  break;
              }
              return {
                ...responses,
                [key]: value,
              };
            }, {})
        };
      }, {});
  }
  /**
   * Represent all required slots as an array of objects able to be consumed as yml
   */
  private representRequiredSlots(): any[] {
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
            };
          }, {})
        };
      }, {});
    return Object.entries(uniqueNamesOfRequiredSlots)
      .map(([slotName, defaultValue]) => ({ [slotName]: { type: Rasa.SlotTypes.text, initial_value: defaultValue } }));
  }
  /**
   * Creates markdown content for intents
   * @returns file contents as a string
   */
  private generateNLUFileContent(): string {
    const { intents, entities } = this.projectData;
    return `${intents.map((intent: flow.Intent, i: number) => {
      // @ts-ignore
      const { id, name: intentName, utterances: examples } = intent;
      return `${i !== 0 ? EOL : ""}<!-- ${new Date().toISOString()} -->
## intent:${this.sanitizeIntentName(intentName)}
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
          const [idOfConnectedIntent] = self.boardStructureByMessages.get(messageFollowingIntent.message_id) as [string];
          const { name: nameOfIntent } = self.getIntent(idOfConnectedIntent) || {} as flow.Intent;
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
        const lineage: string[] = [
          ...this.getIntentLineageForMessage(idOfMessageConnectedByIntent),
          ...idsOfConnectedIntents.map((intentId: string) => {
            // @ts-ignore
            const { name } = this.getIntent(intentId) ?? {};
            return name;
          }),
        ];
        const requirements = this.representRequirementsForIntents();
        const paths: string[] = lineage
          .filter((intentName: string) => typeof this.projectData.intents.find(intent => intent.name === intentName) !== "undefined")
          .map((intentName: string): string => {
            const { id: idOfIntent } = this.projectData.intents.find(intent => intent.name === intentName) as Intent;
            const [firstRequiredSlot] = requirements.get(idOfIntent) as any;
            let slot: string = "";
            if (firstRequiredSlot) {
              const variable = this.projectData.variables.find(variable => variable.id === firstRequiredSlot.variable_id);
              slot = `{"${variable?.name}": "${variable?.default_value}"}`;
            }
            const actionsUnderIntent = this.stories[intentName].map((actionName: string) => (
              `  - utter_${actionName}`
            )).concat(slot ? `  - slot${slot}` : []).join(EOL);
            return `* ${this.sanitizeIntentName(intentName)}${slot}${EOL}${actionsUnderIntent}`;
          });
        const story = uuid();
        const storyName = `## ${story}`;
        return acc + EOL + storyName + EOL + paths.join(EOL) + EOL;
      }, `<!-- ${new Date().toISOString()} -->`);
    await writeFile(join(this.outputDir, "data", "stories.md"), data);
  }
  /**
   * Formats given text
   * @param text text to sanitize
   */
  private sanitizeIntentName(text: string): string {
    return snakeCase(text.replace(/\s/g, ""));
  }
  /**
   * Creates a string representing the required slot structure
   * @remarks this is appending to the serialized string because
   * rasa does not treat the slots as a standard "yamlized" object
   * @param slots the slots from which to create the string
   */
  private formatSlotSpecificYaml(slots: any[]): string {
    const requiredSlots = slots.reduce((acc, slot) => {
      return acc + Object.keys(slot).reduce((accu, slotName) => {
        const data = slot[slotName];
        const twoSpaces = " ".repeat(2);
        const fourSpaces = " ".repeat(4);
        return `${accu}${EOL}${twoSpaces}${slotName}:${EOL}${fourSpaces}type: ${data.type}${EOL}${fourSpaces}auto_fill: False${EOL}`;
      }, "");
    }, "");
    return `slots:${requiredSlots}`;
  }
  /**
   * Writes yml domain file
   * @remark Manually appends serial data with templates for the sake of having
   *         more control over final .yml format, which Rasa CLI is sensitive to.
   * @see https://rasa.com/docs/rasa/core/domains/#images-and-buttons
   * @todo custom payloads(?) and channel-specific responses(?)
   * @see https://rasa.com/docs/rasa/core/domains/#custom-output-payloads
   * @see https://rasa.com/docs/rasa/core/domains/#channel-specific-responses
   */
  private async writeDomainFile(): Promise<void> {
    const outputFilePath = join(this.outputDir, "domain.yml");
    const firstLine = `# ${new Date().toISOString()}`;
    const data: any = {
      intents: this.projectData.intents.map(intent => this.sanitizeIntentName(intent.name)),
      entities: this.projectData.variables.map(variable => variable.name.replace(/\s/, "")),
      actions: this.getUniqueActionNames(),
      templates: this.getTemplates(),
    };
    let serialData: string = toYAML(data);
    const requiredSlots = this.representRequiredSlots();
    if (Array.isArray(requiredSlots) && requiredSlots.length) {
      serialData += this.formatSlotSpecificYaml(requiredSlots);
    }
    return await writeFile(outputFilePath, `${firstLine}${EOL}${serialData}`);
  }
  /**
   * Writes all files produced by script
   */
  public async write(): Promise<void> {
    await this.writeIntentFile();
    await this.writeStoriesFile();
    await this.writeDomainFile();
  }
}
