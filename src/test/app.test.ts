import { describe, it, expect } from "vitest";
import { cn, formatCurrency } from "@/src/lib/utils";
import { INITIAL_PROPERTIES } from "@/src/contexts/PropertyContext";

describe("Frontend Foundation Invariants", () => {
  it("formats currencies with exact decimal representation", () => {
    expect(formatCurrency(125.5, "USD")).toBe("$125.50");
    expect(formatCurrency(0, "USD")).toBe("$0.00");
  });

  it("merges tailwind classnames cleanly via clsx and twMerge", () => {
    const result = cn("p-4 bg-red-500", "p-2 bg-blue-500");
    expect(result).toBe("p-2 bg-blue-500");
  });

  it("initializes multi-property profiles with distinct hostel and hotel configurations", () => {
    expect(INITIAL_PROPERTIES.length).toBeGreaterThanOrEqual(3);

    const hostel = INITIAL_PROPERTIES.find((p) => p.property_type === "hostel");
    expect(hostel).toBeDefined();
    expect(hostel?.configuration.allow_mixed_gender_dorms).toBe(true);
    expect(hostel?.configuration.communal_kitchen_access).toBe(true);

    const hotel = INITIAL_PROPERTIES.find((p) => p.property_type === "hotel");
    expect(hotel).toBeDefined();
    expect(hotel?.configuration.star_rating).toBe(5);
    expect(hotel?.configuration.concierge_available).toBe(true);
  });

  it("enforces unique property codes across all registered inventory", () => {
    const codes = INITIAL_PROPERTIES.map((p) => p.code);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
  });
});
