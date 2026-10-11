import { describe, expect, it } from "vitest";
import { multiBrandStoreSchema, brandSchema, EMPTY_BRAND } from "@/lib/brand";

describe("MultiBrandStore schema and logic", () => {
  it("validates multi brand store schema", () => {
    const store = {
      activeId: "kit-1",
      kits: [
        {
          id: "kit-1",
          name: "Acme Corp",
          brand: {
            ...EMPTY_BRAND,
            colors: ["#ff0000", "#00ff00"],
          },
        },
        {
          id: "kit-2",
          name: "Personal",
          brand: {
            ...EMPTY_BRAND,
            colors: ["#0000ff"],
          },
        },
      ],
    };

    const parsed = multiBrandStoreSchema.safeParse(store);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kits.length).toBe(2);
      expect(parsed.data.kits[0].name).toBe("Acme Corp");
      expect(parsed.data.kits[1].brand.colors[0]).toBe("#0000ff");
    }
  });

  it("handles backward compatibility conversion from legacy single brand", () => {
    const legacyBrand = {
      logo: null,
      colors: ["#123456"],
      fonts: [],
      videos: [],
      intro: null,
      outro: null,
    };

    // If a legacy brand is wrapped:
    const migrated = {
      activeId: "default",
      kits: [{ id: "default", name: "Default Brand", brand: legacyBrand }],
    };

    const parsed = multiBrandStoreSchema.safeParse(migrated);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.activeId).toBe("default");
      expect(parsed.data.kits[0].brand.colors).toEqual(["#123456"]);
    }
  });
});
