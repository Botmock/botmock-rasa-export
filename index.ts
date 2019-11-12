import "dotenv/config";
import { Batcher } from "@botmock-api/client";
import { default as log } from "@botmock-api/log";
import { writeJson, remove, mkdirp, move } from "fs-extra";
import { EOL } from "os";
import { join } from "path";
import { default as FileWriter } from "./lib/file";

const outputBasename = "output";

/**
 * Moves output data to an existing rasa project
 * @remarks replaces existing files in rasa project
 * @param pathToRasaProject relative path to rasa project directory
 * @todo
 */
// async function mvOutput(pathToRasaProject: string): Promise<void> {
//   await move(join(__dirname, outputBasename), pathToRasaProject);
// }

/**
 * Calls all fetch methods and calls all write methods
 *
 * @remark entry point to the script
 *
 * @param args argument vector
 */
async function main(args: string[]): Promise<void> {
  const outputDir = join(__dirname, outputBasename);
  log("recreating output directory");
  await remove(outputDir);
  await mkdirp(outputDir);
  log("fetching project data");
  const { data: projectData }: any = await new Batcher({
    token: process.env.BOTMOCK_TOKEN as string,
    teamId: process.env.BOTMOCK_TEAM_ID as string,
    projectId: process.env.BOTMOCK_PROJECT_ID as string,
    boardId: process.env.BOTMOCK_BOARD_ID as string,
  }).batchRequest([
    "project",
    "board",
    "intents",
    "entities",
    "variables"
  ]);
  log("writing files");
  const writer = FileWriter.getInstance({ outputDir, projectData });
  await writer.write();
  // const [, , pathToRasaProject] = args;
  // if (pathToRasaProject) {
  //   await mvOutput(pathToRasaProject);
  // }
  log("done");
}

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

main(process.argv).catch(async (err: Error) => {
  log(err.stack as string, { isError: true });
  const { message, stack } = err;
  await writeJson(join(__dirname, "err.json"), { message, stack }, { EOL, spaces: 2 });
});
