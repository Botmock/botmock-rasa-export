import "dotenv/config";
import { remove, mkdirp, readFile, readdir } from "fs-extra";
import { execSync } from "child_process";
import { EOL } from "os";
import { join } from "path";
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
    expect(stories.endsWith("- slot{\"thing\": \"thing\"}" + EOL)).toBe(true);
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
  test("creates domain file of correct length", async () => {
    const file = await readFile(join(outputDir, "domain.yml"), "utf8");
    expect(file.split(EOL)).toHaveLength(11);
  });
  test("all fields are present in domain file", async () => {
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
