import "dotenv/config";
import { remove, readdir } from "fs-extra";
import { EOL } from "os";
import { join } from "path";
import { execSync } from "child_process";
// import { projectData } from "./fixtures";
// import { default as FileWriter } from "../lib/file";

const outputDir = join(process.cwd(), "output");

describe("run", () => {
  let execution: unknown;
  beforeEach(async () => {
    execution = execSync("npm start");
  });
  afterEach(async () => {
    await remove(outputDir);
  });
  test("data directory has correct contents", async () => {
    const data = await readdir(join(outputDir, "data"));
    expect(data).toEqual(["nlu.md", "stories.md"]);
  });
  test("output has correct format", () => {
    // @ts-ignore
    expect(execution.toString().split(EOL).length).toBeGreaterThanOrEqual(8);
  });
});
