import { EOL } from "os"
import * as Assets from "./types";

interface Config {
  readonly intents: Assets.Intent[];
  readonly entities: Assets.Entity[];
}

/**
 * Creates markdown content for intents
 * @param config Object containing intents and entities of the project
 * @returns string
 */
export function genIntents({ intents, entities }: Config): string {
  const generateExample = ({ text, variables }, entityList): string => {
    let str: string = text;
    if (variables) {
      variables.forEach(({ name, entity: variableId }: Partial<Assets.Variable>) => {
        // side effect: replaces Botmock variable with Rasa entity
        let search = new RegExp(name, "gi");
        const formattedName = name
          .replace(/%/g, "")
          .replace(/ /g, "_")
          .toLowerCase();
        str = text.replace(search, `[${formattedName}](${formattedName})`);
        search = new RegExp(`\\[(${formattedName})\\]`, "gi");
        // TODO: interface with chatito or chatette
        const matchingEntity = entityList.find(entity => entity.id === variableId);
        if (typeof matchingEntity !== "undefined") {
          // find matching entity, get array of data values it can take on
          str = matchingEntity.data.map(({ value: entityVal, synonyms }) => {
              //create a copy of the current example for each entity value
              const singleExample = str.replace(search, `[${entityVal.trim()}]`);
              if (synonyms.length > 0) {
                // create examples for each synonym (required by rasa for detection)
                const multipleExamples = [
                  singleExample,
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
${examples.map(example => generateExample(example, entities)).join(EOL)}`;
  };

  const generateEntity = (entity: any): string => {
    const { id, name, data: values, updated_at: { date: timestamp } } = entity;
    const synonym_variance: number = values.reduce((count, { synonyms }) => count + synonyms.length, 0);
    // if there are less synonyms than values, create a lookup table
    if (synonym_variance < values.length) {
      const lookupArr = values.map(({ value, synonyms }) =>
        synonyms.length ? `- ${value}\n- ${synonyms.join(`${EOL}-`)}` : `- ${value}`
      );
      return `
<!-- ${timestamp} | ${id} -->
## lookup:${name.replace(/ |-/g, "_").toLowerCase()}
${lookupArr.join(EOL)}
`;
    } else {
      // else, there are enough synonyms
      const synonymsArray = values.map(({ value, synonyms }) => (
        `
<!-- ${timestamp} | entity : ${name} | ${id} -->
## synonym:${value.replace(/ |-/g, "_").toLowerCase()}
- ${synonyms.length ? synonyms.join(`${EOL}-`) : "<!-- need to generate value synonyms here -->"}`
      ));
      return synonymsArray.join(EOL);
    }
  };
  // return the file to be written as a string
  return `${intents.map((intent: Assets.Intent, i: number) => generateIntent(intent, entities, i)).join(EOL)}
${entities.map(entity => generateEntity(entity)).join(EOL)}`;
}
