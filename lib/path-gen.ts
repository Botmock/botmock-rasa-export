import * as flow from "@botmock-api/flow";

interface PathParser { }

interface Options {
  groupUnderIntents: boolean;
}

interface Config {
  intents: flow.Intent[];
  blocks: flow.Message[];
}

type Segment = flow.Message[];

export default class PathGen implements PathParser {
  #blocks: Segment;
  #intents: flow.Intent[];
  #root: flow.Message;
  constructor(public config: Config) {
    this.#blocks = config.blocks;
    this.#intents = config.intents;
    this.#root = this.#blocks.find(block => block.is_root) as flow.Message;
    if (typeof this.#root === "undefined") {
      throw "root is undefined";
    }
  }
  /**
   *
   */
  #collect = () => { };
  /**
   * Generator that completes once the number of next messages are 0 or > 1.
   * @yields Array of {@link flow.Message} contained in the segment.
   */
  #biasedTraversal = function* f(message: flow.Message): IterableIterator<Segment | void> {
    let segment: Segment = [message];
    let endOfPath: Segment = segment;
    if (message.next_message_ids?.length === 1) {
      // const nextMessage = this.#blocks.find()
      // yield* f(nextMessage)
    }
  };
  /**
   * Gets an array of the unique paths that are hidden in the project structure.
   * @param options {@link Options} object.
   */
  public getUniquePaths(options: Options): Segment[] {
    if (!options.groupUnderIntents) {
      throw "unimplemented";
    }
    let generator = this.#biasedTraversal(this.#root);
    let segment: IteratorResult<Segment | void>;
    let paths: Segment[] = [];
    while (segment = generator.next()) {
      if (segment.done) {
        break;
      }
      paths.push(segment.value as Segment);
    }
    return paths;
  }
}
