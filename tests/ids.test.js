import { describe, it, expect } from "vitest";
import { docId } from "../src/sync/ids.js";

describe("Firestore document names", () => {
  it("never contain a slash (it would split the path)", () => {
    expect(docId("rq:kouyu-rumen/1/r1#0")).toBe("rq:kouyu-rumen%2F1%2Fr1#0");
    expect(docId("r:a/b")).not.toContain("/");
  });
  it("leave ordinary keys unchanged", () => {
    expect(docId("w:你")).toBe("w:你");
    expect(docId("o:老师，您好！")).toBe("o:老师，您好！");
  });
  it("are unambiguous: different keys never get the same name", () => {
    expect(docId("x:a/b")).not.toBe(docId("x:a%2Fb"));
  });
});
