import { describe, expect, it } from "vitest";

import { nextPricingFromInput } from "./modelForm";

describe("nextPricingFromInput", () => {
  it("updates a pricing field while preserving existing rates", () => {
    expect(nextPricingFromInput({ input_per_mtok: 1, output_per_mtok: 2 }, "output_per_mtok", "3.5"))
      .toEqual({ input_per_mtok: 1, output_per_mtok: 3.5 });
  });

  it("rejects negative and non-numeric values by clearing the field", () => {
    expect(nextPricingFromInput({ input_per_mtok: 1, output_per_mtok: 2 }, "output_per_mtok", "-1"))
      .toEqual({ input_per_mtok: 1, output_per_mtok: 0 });
    expect(nextPricingFromInput({ input_per_mtok: 1, output_per_mtok: 2 }, "output_per_mtok", "abc"))
      .toEqual({ input_per_mtok: 1, output_per_mtok: 0 });
  });

  it("drops the pricing override when the final field is cleared", () => {
    expect(nextPricingFromInput({ input_per_mtok: 1 }, "input_per_mtok", "")).toBeUndefined();
  });
});
