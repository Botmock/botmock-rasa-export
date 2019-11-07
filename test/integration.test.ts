import { remove, mkdirp, readFile, outputFile } from "fs-extra";
import { EOL, tmpdir } from "os";
import { execSync } from "child_process";
import { join } from "path";
import { default as FileWriter } from "../lib/file";
import { projectData } from "./fixtures";

const outputDir = join(tmpdir(), "output");

describe("run", () => {
  let execution: unknown;
  beforeEach(async () => {
    await mkdirp(outputDir);
    execution = execSync("npm start");
  });

  afterEach(async () => {
    await remove(outputDir);
  });
  test.todo("all required slots are present in stories file");
  test.todo("all actions implied by project data are present in domain file");
  test("outputs correct number of newlines", () => {
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
