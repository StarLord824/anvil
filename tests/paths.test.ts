import { expect, test } from "bun:test";
import { dockerMountPath, toPosix } from "../src/workspace/paths";

test("toPosix normalises windows separators", () => {
  expect(toPosix("F:\\a\\b\\c.ts")).toBe("F:/a/b/c.ts");
});

test("toPosix leaves posix paths untouched", () => {
  expect(toPosix("/work/src/a.ts")).toBe("/work/src/a.ts");
});

test("dockerMountPath converts a windows drive path", () => {
  expect(dockerMountPath("F:\\Hackathons\\x")).toBe("/f/Hackathons/x");
});

test("dockerMountPath passes posix paths through", () => {
  expect(dockerMountPath("/home/u/x")).toBe("/home/u/x");
});
