import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOrderQuestions } from "../order-configuration.evaluator.js";

describe("Order configuration evaluator", () => {
  const questions = [
    { code: "print_side", isVisible: true, isRequired: true },
    { code: "uv", isVisible: true, isRequired: false },
    { code: "uv_mask_back", isVisible: false, isRequired: false },
  ];

  const rules = [
    {
      id: "1",
      targetFieldId: "x",
      targetFieldCode: "uv_mask_back",
      ruleType: "SHOW" as const,
      condition: { field: "uv", equals: "both" },
      sortOrder: 0,
    },
    {
      id: "2",
      targetFieldId: "x",
      targetFieldCode: "uv_mask_back",
      ruleType: "REQUIRE" as const,
      condition: { field: "uv", equals: "both" },
      sortOrder: 1,
    },
  ];

  it("keeps default visibility when condition not met", () => {
    const resolved = resolveOrderQuestions(questions, rules, { uv: "front" });
    const back = resolved.find((r) => r.code === "uv_mask_back");
    assert.equal(back?.visible, false);
    assert.equal(back?.required, false);
  });

  it("shows and requires field when UV = both", () => {
    const resolved = resolveOrderQuestions(questions, rules, { uv: "both" });
    const back = resolved.find((r) => r.code === "uv_mask_back");
    assert.equal(back?.visible, true);
    assert.equal(back?.required, true);
  });
});
