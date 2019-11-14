import * as flow from "@botmock-api/flow";
import { EOL } from "os"

/**
 * Creates file content from resources
 * @param utterance a single utterance
 * @param entities all entities
 */
export function generateExampleContent(utterance: flow.Utterance, entities: flow.Entity[]): string {
  const { text, variables } = utterance;
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
      const matchingEntity = entities.find(entity => entity.id === variableId);
      if (typeof matchingEntity !== "undefined") {
        // @ts-ignore
        str = matchingEntity.data.map(({ value: entityVal, synonyms }) => {
          const singleExample = str.replace(search, `[${entityVal.trim()}]`);
          if (synonyms.length > 0) {
            const multipleExamples = [
              singleExample,
              ...synonyms.map((synonym: any) => str.replace(search, `[${synonym.trim()}]`))
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
}

/**
 * Creates file content from entity resource
 * @param entity a single entity
 */
export function generateEntityContent(entity: flow.Entity & { updated_at?: any }): string {
  const { id, name, data: values, updated_at: { date: timestamp } } = entity;
  const synonym_variance: number = values.reduce((count: number, { synonyms }: any) => count + synonyms.length, 0);
  if (synonym_variance < values.length) {
    return `## lookup:${name.replace(/ |-/g, "_").toLowerCase()}${values.map(({ value, synonyms }: any) => (
      synonyms.length ? `- ${value}\n- ${synonyms.join(`${EOL}-`)}` : `- ${value}`
    )).join(EOL)}
`;
  } else {
    return values.map(({ value, synonyms }: any) => (
      `## synonym:${value.replace(/ |-/g, "_").toLowerCase()}
- ${synonyms.length ? synonyms.join(`${EOL}-`) : "<!-- need to generate value synonyms here -->"}`
    )).join(EOL);
  }
}
