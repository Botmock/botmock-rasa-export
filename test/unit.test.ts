import { join } from "path";
import { tmpdir } from "os";
import { remove, mkdirp, readFile, readdir } from "fs-extra";
// import { default as FileWriter } from "../lib/file";
// import { projectData } from "./fixtures";

const outputDir = join(tmpdir(), "output");

beforeEach(async () => {
  await remove(outputDir);
  await mkdirp(outputDir);
});

afterAll(async () => {
  await remove(outputDir);
});

describe.skip("public methods", () => {});

test.todo("");
