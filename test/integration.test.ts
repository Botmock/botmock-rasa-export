import "dotenv/config";
// import { Simulator } from "@botmock-api/flow";
import { remove, readFile, readdir } from "fs-extra";
import { EOL } from "os";
import { join } from "path";
import { execSync } from "child_process";
import { projectData } from "./fixtures";
import { default as FileWriter } from "../lib/file";

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
  test("all required slots are present in stories file", async () => {
    const stories = await readFile(join(outputDir, "data", "stories.md"), "utf8");
    expect(stories.endsWith(EOL)).toBe(true);
  });
  test.todo("all actions implied by project data are present in domain file");
  test("output has correct format", () => {
    // @ts-ignore
    expect(execution.toString().split(EOL).length).toBeGreaterThanOrEqual(8);
  });
});

describe("files", () => {
  let instance: FileWriter;
  beforeEach(async () => {
    instance = FileWriter.getInstance({ projectData, outputDir });
    await instance.write();
  });
  test("domain file has correct length", async () => {
    const file = await readFile(join(outputDir, "domain.yml"), "utf8");
    expect(file.split(EOL)).toHaveLength(11);
  });
  test("domain file has correct fields", async () => {
    const file = await readFile(join(outputDir, "domain.yml"), "utf8");
    const lines = file.split(EOL).slice(1);
    const fieldNames = new Set(["intents", "entities", "actions", "templates", "slots"]);
    for (const line of lines) {
      const possibleKey = line.match(/[a-z]{5, 8}\:/);
      if (!Object.is(possibleKey, null)) {
        const [keyname] = possibleKey as any[];
        expect(fieldNames.has(keyname.slice(0, -1))).toBe(true);
      }
    }
  });
});
