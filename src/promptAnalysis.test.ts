import { describe, expect, it } from "vitest";
import { analyzePromptText, extractArtistDirectives } from "./promptAnalysis";

describe("artist directive syntax", () => {
  it("preserves merge, alias, bot list and bot control syntax", () => {
    const directives = extractArtistDirectives("@[calamity brezze|thenintlichen96:0.8], @orz (kagewaka), #andaerz, #amu \\(m aa\\), #=@");
    expect(directives).toEqual([
      { raw: "@[calamity brezze|thenintlichen96:0.8]", artists: ["calamity brezze", "thenintlichen96"], weight: 0.8, mode: "merge" },
      { raw: "@orz (kagewaka)", artists: ["orz"], alias: "kagewaka", mode: "artist" },
      { raw: "#andaerz", artists: ["andaerz"], mode: "bot-list" },
      { raw: "#amu \\(m aa\\)", artists: ["amu (m aa)"], mode: "bot-list" },
      { raw: "#=@", artists: [], mode: "bot-control" },
    ]);
  });

  it("does not report artist operators as unknown catalog fragments", () => {
    const result = analyzePromptText("@[calamity brezze|thenintlichen96:0.8], #sarnath, #=@", []);
    expect(result.unknown).toEqual([]);
    expect(result.artistDirectives).toHaveLength(3);
  });
});
