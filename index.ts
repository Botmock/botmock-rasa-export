import "dotenv/config";
import * as fs from "fs-extra";
import { Batcher } from "@botmock-api/client";
import { default as log } from "@botmock-api/log";
// import { execSync } from "child_process";
import { EOL } from "os";
import { sep, join, resolve } from "path";
import { default as FileWriter } from "./lib/file";

const outputBasename = "output";

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
  if (process.platform === "darwin" && relativePathToRasaProject) {
    // await mvOutput(relativePathToRasaProject);
    // await fs.remove(outputDir);
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
 * @todo
 */
// async function mvOutput(relativePathToRasaProject: string): Promise<void> {
//   const outputPath = join(__dirname, outputBasename);
//   const filepaths: string[] = await (await fs.readdir(outputPath))
//     // @ts-ignore
//     .reduce(async (acc, content) => {
//       const filepath: string = join(outputPath, content);
//       if ((await fs.stat(filepath)).isDirectory()) {
//         return [
//           ...acc,
//           ...(await fs.readdir(filepath))
//             // @ts-ignore
//             .reduce((accu, deepContent) => {
//               const deepFilepath = join(filepath, deepContent);
//               return [...accu, deepFilepath];
//             }, [])
//         ]
//       }
//       const data = acc instanceof Promise ? await acc : acc;
//       return [
//         ...data,
//         filepath,
//       ];
//     }, []);
//   const absolutePathToRasaProject = resolve(relativePathToRasaProject)
//   for (const src of filepaths) {
//     const splitPath = src.split(sep);
//     const dest = join(absolutePathToRasaProject, splitPath.slice(splitPath.indexOf(outputBasename + 1)).join(sep));
//     execSync(`mv ${src} ${dest}`);
//   }
// }
