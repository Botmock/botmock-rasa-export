import { join } from "path";
import { tmpdir } from "os";
import { remove, mkdirp, readFile, readdir } from "fs-extra";
import { default as FileWriter } from "../lib/file";
import { projectData } from "./fixtures";

const outputDir = join(tmpdir(), "output");

beforeEach(async () => {
  await remove(outputDir);
  await mkdirp(outputDir);
});

afterAll(async () => {
  await remove(outputDir);
});

describe("file writer", () => {
  let instance: FileWriter;
  beforeEach(() => {
    instance = FileWriter.getInstance({ projectData, outputDir });
  });
  test.todo("write method");
});

describe("slots", () => {
  test.todo("all required slots are present in domain file");
  test.todo("all required slots are present in nlu file");
});
