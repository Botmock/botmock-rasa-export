import * as flow from "@botmock-api/flow";

interface PathParser { }

interface Options {
  groupUnderIntents: boolean;
}

interface Config {
  intents: flow.Intent[];
  blocks: flow.Message[];
}

export default class PathGen implements PathParser {
  #blocks: flow.Message[];
  #intents: flow.Intent[];
  constructor(public config: Config) {
    this.#blocks = config.blocks;
    this.#intents = config.intents;
  }
  /**
   * Generator that completes once the next messages are 0 or > 1.
   * @yields Array of {@link flow.Message} contained in the segment.
   */
  #greedyTraversal = function* () {
    yield [];
  };
  /**
   * Gets an array of the unique paths that are hidden in the project structure.
   * @param options {@link Options} object.
   */
  public getUniquePaths(options: Options): flow.Message[] {
    if (!options.groupUnderIntents) {
      throw "unimplemented";
    }
    const fullPaths = [];
    return [];
  }
}
