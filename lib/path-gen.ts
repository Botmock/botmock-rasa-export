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
   * Root-most block coming from intent ->
   *
   * Generator that yields a segment of blocks (messages) contained in a deterministic path.
   * @param block
   * @param blocks
   * @yields Array of {@link flow.Message} contained in the segment.
   */
  #biasedTreeBuilder = function* f(block: flow.Message, blocks: flow.Message[]): IterableIterator<Segment | void> {
    // let segment: Segment = [block];
    // let endOfPath: Segment = segment;
    // When there is a single upcoming message
    if (block.next_message_ids?.length === 1) {
      const nextMessage = blocks.find(b => b.message_id === (block.next_message_ids as any)[0].message_id);
      if (typeof nextMessage !== "undefined") {
        yield [];
      }
      // @ts-ignore
    } else if (block.next_message_ids?.length > 1) {
      // for (const next of block?.next_message_ids) {
      //   yield* f(nextMessage, blocks);
      // }
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
    const builder = this.#biasedTreeBuilder(this.#root, this.#blocks);
    let segment: IteratorResult<Segment | void>;
    let paths: Segment[] = [];
    while (segment = builder.next()) {
      if (segment.done) {
        break;
      }
      paths.push(segment.value as Segment);
    }
    return paths;
  }
}
