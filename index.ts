import "dotenv/config";
import * as fs from "fs-extra";
import { Batcher } from "@botmock-api/client";
import { default as log } from "@botmock-api/log";
import { EOL } from "os";
import { join } from "path";
import { default as FileWriter } from "./lib/file";

/**
 * Calls all fetch methods and calls all write methods
 *
 * @remark entry point to the script
 *
 * @param args argument vector
 */
async function main(args: string[]): Promise<void> {
  const outputBasename = "output";
  const outputDir = join(__dirname, outputBasename);
  log("recreating output directory");
  await fs.remove(outputDir);
  await fs.mkdirp(outputDir);
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
  const [, , relativePathToRasaProject] = args;
  if (relativePathToRasaProject) {
    await copyOutput(outputDir, relativePathToRasaProject);
  }
  log("done");
}

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

main(process.argv).catch(async (err: Error) => {
  log(err.stack as string, { isError: true });
  const { message, stack } = err;
  await fs.writeJson(join(__dirname, "err.json"), { message, stack }, { EOL, spaces: 2 });
});

/**
 * Moves output data to an existing rasa project
 * @remarks replaces existing files in rasa project
 * @param relativePathToRasaProject relative path to rasa project directory
 */
async function copyOutput(outputDirectory:string, relativePathToRasaProject: string): Promise<void> {
  await fs.copy(outputDirectory, relativePathToRasaProject);
}
