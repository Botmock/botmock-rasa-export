import { join } from "path";
import { tmpdir } from "os";
import { remove, mkdirp } from "fs-extra";
import { generateEntityContent, generateExampleContent } from "../lib/nlu";
// import { projectData } from "./fixtures";

const outputDir = join(tmpdir(), "output");

beforeEach(async () => {
  await remove(outputDir);
  await mkdirp(outputDir);
});

afterAll(async () => {
  await remove(outputDir);
});

test.todo("entity content is non-empty string");
test.todo("example content is non-empty string");
