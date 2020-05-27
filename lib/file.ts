import uuid from "uuid/v4";
import * as flow from "@botmock-api/flow";
// import { wrapEntitiesWithChar } from "@botmock-api/text";
import { stringify as toYAML } from "yaml";
import { writeFile, mkdirp } from "fs-extra";
// @ts-ignore
import { default as snakeCase } from "to-snake-case";
import { join } from "path";
import { v4 } from "uuid";
import { EOL } from "os";
import * as nlu from "./nlu";
import { Botmock, Rasa } from "./types";

export type ProjectData<T> = T extends Promise<infer K> ? K : any;

interface Conf {
  readonly outputDir: string;
  readonly projectData: unknown;
}

export default class FileWriter extends flow.AbstractProject {
  static instance: FileWriter;
  private welcomeIntent!: flow.Intent;
  private outputDir: string;
  private stories: Set<string>;

  #boardMap: Map<string, string[]> = new Map();

  /**
   * Sets private field to contain map of: message id -> intent ids connected to it.
   * @param messages Array of {@link Message}
   */
  #buildBoardMap = (messages: flow.Message[]): void => {
    for (const m of messages) {
      for (const { message_id, intent } of m.next_message_ids ?? []) {
        if (intent && intent !== "") {
          if (this.#boardMap.has(message_id)) {
            const intentsDiscoveredForMessageId = [...this.#boardMap.get(message_id) ?? []];
            let incomingValue: string[] = [];
            if (!intentsDiscoveredForMessageId.includes((intent as any).value)) {
              incomingValue = (intent as any).value;
            }
            this.#boardMap.delete(message_id);
            this.#boardMap.set(message_id, [...intentsDiscoveredForMessageId, ...incomingValue]);
          } else {
            this.#boardMap.set(message_id, [(intent as any).value]);
          }
        }
      }
    }
  };
  /**
   * Bootstraps instance, creating a welcome intent if none is found between the
   * root node and the first non-root node.
   * @param config {@link Config} object.
   */
  private constructor(config: Conf) {
    super({ projectData: config.projectData as ProjectData<typeof config.projectData> });

    this.outputDir = config.outputDir;
    this.#buildBoardMap(this.projectData.board.board.messages);

    for (const message of this.projectData.board.board.messages) {
      const [rootParentId] = message.previous_message_ids?.filter(previous => {
        const previousMessage = this.getMessage(previous.message_id) as Botmock.Message;
        return previousMessage.is_root;
      }).map(previous => previous.message_id) as any[];
      if (rootParentId) {
        if (!this.#boardMap.get(rootParentId)) {
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
          this.#boardMap.set(rootParentId, [this.welcomeIntent.id]);
        }
      }
    }
    this.stories = this.#buildUniqueMessageIds();
  }
  /**
   * Get singleton class
   * @returns only existing instance of the class
   */
  public static getInstance(config: Conf): FileWriter {
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
    return Array.from([...this.stories])
      .map(action => `utter_${action}`);
  }
  /**
   * Builds set of "leading" message ids
   * @returns Set of unique messages ids
   */
  #buildUniqueMessageIds = (): Set<string> => {
    return new Set([...this.#boardMap.keys()]);
  };
  /**
   * Creates object describing responses for the project
   * @returns nested object containing content block data
   */
  private getTemplates(): Rasa.Template {
    return this.getUniqueActionNames().reduce((templates, leadingMessageId: string) => {
      const message = this.getMessage(leadingMessageId.slice("utter_".length)) as flow.Message;
      return {
        ...templates,
        [leadingMessageId]: [message, ...this.gatherMessagesUpToNextIntent(message)]
          .reduce((responses: object, response: flow.Message) => {
            let key, value: string | any;
            let impliedObject: { [key: string]: any; } = {};
            switch (response.message_type) {
              case "text":
                [key, value] = [Rasa.TemplateTypes.TEXT, response.payload?.text as string];
                break;
              case "image":
                [key, value] = [Rasa.TemplateTypes.IMAGE, response.payload?.image_url as string];
                break;
              case "button":
                if (response.payload?.text) {
                  impliedObject[Rasa.TemplateTypes.TEXT] = response.payload.text;
                }
                [key, value] = [
                  Rasa.TemplateTypes.BUTTONS,
                  response.payload?.buttons?.map(button => ({
                    title: button.title,
                    payload: button.title.trim(),
                  })) as object[],
                ];
                break;
              case "quick_replies":
                if (response.payload?.text) {
                  impliedObject[Rasa.TemplateTypes.TEXT] = response.payload.text;
                }
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
              ...impliedObject,
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
    return `${this.projectData.intents.concat([this.welcomeIntent] ?? []).map((intent: flow.Intent, i: number) => {
      const { name: intentName, utterances: examples } = intent;
      return `${i !== 0 ? EOL : ""}<!-- ${new Date().toISOString()} -->
## intent:${this.sanitizeIntentName(intentName)}
${examples.map((example: any) => nlu.generateExampleContent(example, this.projectData.entities)).join(EOL)}`;
    }).join(EOL)}
${this.projectData.entities.map(entity => nlu.generateEntityContent(entity)).join(EOL)}`;
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
        if ((messageFollowingIntent = previousMessageIds.find(m => self.#boardMap.get(m.message_id)))) {
          const [idOfConnectedIntent] = self.#boardMap.get(messageFollowingIntent.message_id) as [string];
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
   * leads to a message that is directly connected by an intent.
   * @todo
   */
  private async writeStoriesFile(): Promise<void> {
    const requirements = this.representRequirementsForIntents();
    const data = Array.from(this.#boardMap.keys())
      .reduce((stories, messageId: string) => {
        const intentIds = this.#boardMap.get(messageId) as any[];
        const lineage: string[] = [
          ...this.getIntentLineageForMessage(messageId),
          ...intentIds.map((intentId: string) => {
            const { name } = this.getIntent(intentId) ?? {} as any;
            return name;
          }),
        ];
        const paths: string[] = lineage
          .filter((intentName: string) => typeof this.projectData.intents.find(intent => intent.name === intentName) !== "undefined")
          .map((intentName: string): string => {
            const { id: idOfIntent } = this.projectData.intents.find(intent => intent.name === intentName) as flow.Intent;
            const [firstRequiredSlot] = requirements.get(idOfIntent) as any;
            let slot: string = "";
            if (firstRequiredSlot) {
              const variable = this.projectData.variables.find(variable => variable.id === firstRequiredSlot.variable_id);
              slot = `{"${variable?.name}": "${variable?.default_value}"}`;
            }
            const actionsUnderIntent = [].map((actionName: string) => (
              `  - utter_${actionName}`
            )).concat(slot ? `  - slot${slot}` : []).join(EOL);
            return `* ${this.sanitizeIntentName(intentName)}${slot}${EOL}${actionsUnderIntent}`;
          });
        const story = uuid();
        const storyName = `## ${story}`;
        return stories + EOL + storyName + EOL + paths.join(EOL) + EOL;
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
      intents: this.projectData.intents
        .map(intent => this.sanitizeIntentName(intent.name))
        .concat(this.welcomeIntent ? [this.sanitizeIntentName(this.welcomeIntent.name)] : []),
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
