import "dotenv/config";
import * as Sentry from "@sentry/node";
// import { RewriteFrames } from "@sentry/integrations";
import { Batcher } from "@botmock-api/client";
import { default as log } from "@botmock-api/log";
import { remove, mkdirp } from "fs-extra";
import { join } from "path";
import { SENTRY_DSN } from "./lib/constants";
import { default as FileWriter } from "./lib/file";
// @ts-ignore
import pkg from "./package.json";

declare global {
  namespace NodeJS {
    interface Global {
      __rootdir__: string;
    }
  }
}

global.__rootdir__ = __dirname || process.cwd();

Sentry.init({
  dsn: SENTRY_DSN,
  release: `${pkg.name}@${pkg.version}`,
  // integrations: [new RewriteFrames({
  //   root: global.__rootdir__
  // })],
  // beforeSend(event): Sentry.Event {
  //   if (event.user.email) {
  //     delete event.user.email;
  //   }
  //   return event;
  // }
});

async function main(args: string[]): Promise<void> {
  const DEFAULT_OUTPUT_DIR = "output";
  let [, , outputDirectory] = args;
  if (process.env.OUTPUT_DIR) {
    outputDirectory = process.env.OUTPUT_DIR
  }
  const outputDir = join(__dirname, outputDirectory || DEFAULT_OUTPUT_DIR);
  try {
    log("recreating output directory");
    await remove(outputDir);
    await mkdirp(outputDir);
    log("fetching project data");
    const { data: projectData } = await new Batcher({
      token: process.env.BOTMOCK_TOKEN,
      teamId: process.env.BOTMOCK_TEAM_ID,
      projectId: process.env.BOTMOCK_PROJECT_ID,
      boardId: process.env.BOTMOCK_BOARD_ID,
    }).batchRequest([
      "project",
      "board",
      "intents",
      "entities",
      "variables"
    ]);
    log("writing file");
    const writer = new FileWriter({ outputDir, projectData });
    await writer.createYml();
    await writer.createMd();
  } catch (err) {
    log(err.stack, { isError: true });
    throw err;
  }
  log("done");
}

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

main(process.argv).catch(err => {
  if (!process.env.SHOULD_OPT_OUT_OF_ERROR_REPORTING) {
    Sentry.captureException(err);
  }
  process.exit(1);
})
