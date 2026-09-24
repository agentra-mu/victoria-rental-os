import { describe, expect, it } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns trimmed values for present keys", () => {
    expect(requireEnv({ A: " x ", B: "y" }, ["A", "B"])).toEqual({
      A: "x",
      B: "y",
    });
  });

  it("lists every missing or blank key in one error", () => {
    expect(() => requireEnv({ A: "x", B: "  " }, ["A", "B", "C"])).toThrow(
      "Missing environment variables: B, C",
    );
  });
});
