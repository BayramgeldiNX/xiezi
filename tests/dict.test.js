import { describe, it, expect } from "vitest";
import { numberedToMarks, parseCedict, shardOf } from "../scripts/gen-dict.mjs";

describe("numberedToMarks", () => {
  it("puts the mark on the right vowel", () => {
    expect(numberedToMarks("wai4 mai4")).toBe("wài mài");
    expect(numberedToMarks("ni3 hao3")).toBe("nǐ hǎo");
    expect(numberedToMarks("liu2 xue2 sheng1")).toBe("liú xué shēng");
    expect(numberedToMarks("hui2")).toBe("huí");
    expect(numberedToMarks("jiu3")).toBe("jiǔ");
  });
  it("handles ü", () => {
    expect(numberedToMarks("lu:4")).toBe("lǜ");
    expect(numberedToMarks("nu:3 er2")).toBe("nǚ ér");
    expect(numberedToMarks("lu:e4")).toBe("lüè");
  });
  it("leaves neutral tone and erhua unmarked", () => {
    expect(numberedToMarks("xie4 xie5")).toBe("xiè xie");
    expect(numberedToMarks("dian3 r5")).toBe("diǎn r");
    expect(numberedToMarks("ma5")).toBe("ma");
  });
  it("keeps capitals", () => {
    expect(numberedToMarks("Zhong1 guo2")).toBe("Zhōng guó");
  });
});

describe("parseCedict", () => {
  const text = [
    "# comment",
    "外賣 外卖 [wai4 mai4] /takeout/to deliver food/CL:個|个[ge4]/",
    "綠 绿 [lu:4] /green/",
    "綠 绿 [lu4] /variant of x/",
    "長 长 [chang2] /long/length/strong point/forte/",
    "長 长 [zhang3] /chief/",
  ].join("\n");
  it("keys by simplified, merges senses and caps them at 3", () => {
    const d = parseCedict(text);
    expect(d["外卖"]).toEqual([["wài mài", "takeout; to deliver food"]]);
    expect(d["长"][0]).toEqual(["cháng", "long; length; strong point"]);
    expect(d["长"][1]).toEqual(["zhǎng", "chief"]);
    expect(d["绿"][0][0]).toBe("lǜ");
  });
  it("shards by first character", () => {
    expect(shardOf("外卖")).toBe("外".codePointAt(0) % 64);
  });
});
