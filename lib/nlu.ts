import * as flow from "@botmock-api/flow";
import { EOL } from "os"

interface Config {
  readonly intents: flow.Intent[];
  readonly entities: flow.Entity[];
}

/**
 * Creates markdown content for intents
 * @param config object containing intents and entities of the project
 * @returns file contents as a string
 */
export function genIntents({ intents, entities }: Config): string {
  const generateExample = ({ text, variables }: flow.Utterance, entityList: flow.Entity[]): string => {
    let str: string = text;
    if (variables) {
      variables.forEach(({ name, entity: variableId }: Partial<flow.Variable>) => {
        // @ts-ignore
        let search = new RegExp(name, "gi");
        // @ts-ignore
        const formattedName = name
          .replace(/%/g, "")
          .replace(/ /g, "_")
          .toLowerCase();
        str = text.replace(search, `[${formattedName}](${formattedName})`);
        search = new RegExp(`\\[(${formattedName})\\]`, "gi");
        const matchingEntity = entityList.find(entity => entity.id === variableId);
        if (typeof matchingEntity !== "undefined") {
          // @ts-ignore
          str = matchingEntity.data.map(({ value: entityVal, synonyms }) => {
              const singleExample = str.replace(search, `[${entityVal.trim()}]`);
              if (synonyms.length > 0) {
                const multipleExamples = [
                  singleExample,
                  // @ts-ignore
                  ...synonyms.map(synonym => str.replace(search, `[${synonym.trim()}]`))
                ].join(`${EOL}- `);
                return multipleExamples;
              }
              return singleExample;
            }
          );
        }
      });
    }
    return `- ${str}`;
  };

  const generateIntent = (intent: any, entities: any, index: number): string => {
    const { id, name, utterances: examples, updated_at: { date: timestamp } } = intent;
    return `${index !== 0 ? EOL : ""}<!-- ${timestamp} | ${id} -->
## intent:${name.toLowerCase()}
${examples.map((example: any) => generateExample(example, entities)).join(EOL)}`;
  };

  const generateEntity = (entity: any): string => {
    const { id, name, data: values, updated_at: { date: timestamp } } = entity;
    // @ts-ignore
    const synonym_variance: number = values.reduce((count, { synonyms }) => count + synonyms.length, 0);
    if (synonym_variance < values.length) {
      // @ts-ignore
      const lookupArr = values.map(({ value, synonyms }) =>
        synonyms.length ? `- ${value}\n- ${synonyms.join(`${EOL}-`)}` : `- ${value}`
      );
      return `
<!-- ${timestamp} | ${id} -->
## lookup:${name.replace(/ |-/g, "_").toLowerCase()}
${lookupArr.join(EOL)}
`;
    } else {
      // @ts-ignore
      const synonymsArray = values.map(({ value, synonyms }) => (
        `
<!-- ${timestamp} | entity : ${name} | ${id} -->
## synonym:${value.replace(/ |-/g, "_").toLowerCase()}
- ${synonyms.length ? synonyms.join(`${EOL}-`) : "<!-- need to generate value synonyms here -->"}`
      ));
      return synonymsArray.join(EOL);
    }
  };
  return `${intents.map((intent: flow.Intent, i: number) => generateIntent(intent, entities, i)).join(EOL)}
${entities.map(entity => generateEntity(entity)).join(EOL)}`;
}
