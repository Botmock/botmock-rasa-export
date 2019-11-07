import "dotenv/config";
// import { FileWriter } from "@botmock-api/file";
import { Batcher } from "@botmock-api/client";
import { default as log } from "@botmock-api/log";
import { writeJson, remove, mkdirp } from "fs-extra";
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
  const DEFAULT_OUTPUT_DIR = "output";
  let [, , outputDirectory] = args;
  if (process.env.OUTPUT_DIR) {
    outputDirectory = process.env.OUTPUT_DIR
  }
  const outputDir = join(__dirname, outputDirectory || DEFAULT_OUTPUT_DIR);
  log("recreating output directory");
  await remove(outputDir);
  await mkdirp(outputDir);
  log("fetching project data");
  // @ts-ignore
  const { data: projectData } = await new Batcher({
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
  log("done");
}

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

main(process.argv).catch(async (err: Error) => {
  log(err.stack as string, { isError: true });
  if (process.env.OPT_IN_ERROR_REPORTING) {
    // Sentry.captureException(err);
  } else {
    const { message, stack } = err;
    await writeJson(join(__dirname, "err.json"), { message, stack }, { EOL, spaces: 2 });
  }
});
