import * as flow from "@botmock-api/flow";
import { IntentMap } from "./file"

interface IntentObj {
  intentMap: IntentMap;
  messageCollector: Function;
  readonly intents: flow.Intent[];
  readonly messages: flow.Message[];
}

/**
 * Creates object associating intent names with the titles of blocks that flow from them
 * @param intentObj Intent object that describes relation between messages and intents
 * @returns Stories
 */
export function convertIntentStructureToStories(intentObj: IntentObj): { [intent: string]: string[] } {
  const { messages, intents, intentMap, messageCollector } = intentObj;
  const getMessage = (id: string): flow.Message | void => (
    messages.find(message => message.message_id === id)
  );
  return Array.from(intentMap).reduce(
    (acc, [idOfMessageConnectedByIntent, connectedIntentIds]) => ({
      ...acc,
      ...connectedIntentIds.reduce((accu, id: string) => {
        const message: any = getMessage(idOfMessageConnectedByIntent);
        const intent: flow.Intent = intents.find(intent => intent.id === id);
        if (typeof intent !== "undefined") {
          return {
            ...accu,
            [intent.name]: [
              message,
              ...messageCollector(message.next_message_ids).map(getMessage)
            ].map((message: flow.Message) => message.message_id)
          };
        } else {
          return accu;
        }
      }, {})
    }),
    {}
  );
}
