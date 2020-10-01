import "dotenv/config";
import { RasaExporter, FileWriter, Kind, ProjectReference } from "@botmock/export";

/**
 * Generates `./domain.yml` and `./data` directory in `./output`.
 *
 * @example
 * ```shell
 * npm start
 * ```
 */
async function main(): Promise<void> {
  const projectReference: ProjectReference = {
    teamId: process.env.BOTMOCK_TEAM_ID as string,
    projectId: process.env.BOTMOCK_PROJECT_ID as string,
    boardId: process.env.BOTMOCK_BOARD_ID,
  };

  // hooks to modify output
  const _modifyIntentCallback = (intent: any) => {
    return intent;
  };
  const _modifyUtteranceCallback = (utterance: any) => {
    return utterance;
  }
  const _modifyEntityCallback = (entity: any) => {
    return entity;
  }

  const exporter = new RasaExporter({
    token: process.env.BOTMOCK_TOKEN as string,
    modifyIntentCallback: _modifyIntentCallback,
    modifyUtteranceCallback: _modifyUtteranceCallback,
    modifyEntityCallback: _modifyEntityCallback,
    useNodeNameForResponses: false // use block title instead of ids. Highly recommended to leave it false
  });
  

  const { data } = await exporter.export({ projectReference });

  const writeResult = await (new FileWriter({ directoryRoot: "./output" })).writeAllResourcesToFiles({ data });
  if (writeResult.kind !== Kind.OK) {
    console.error(writeResult.value);
  }
}

process.on("unhandledRejection", () => { });
process.on("uncaughtException", () => { });

main().catch((err: Error) => {
  console.error(err);
});
