import { describe, expect, it } from "vitest";
import { emptyDoc } from "@/lib/edit/doc";
import { addMarker, deleteMarker, updateMarker } from "@/lib/edit/docEdit";

describe("Timeline Markers", () => {
  it("adds, sorts, updates and deletes markers on TimelineDoc", () => {
    let doc = emptyDoc();
    expect(doc.markers).toBeUndefined();

    // 1. Add markers out of order
    const { doc: doc1, markerId: m1 } = addMarker(doc, 5.5, "Hook intro", "red");
    const { doc: doc2, markerId: m2 } = addMarker(doc1, 2.0, "Title card", "green");
    const { doc: doc3, markerId: m3 } = addMarker(doc2, 8.2, "Outro", "amber");

    // Markers must be sorted by time
    expect(doc3.markers?.length).toBe(3);
    expect(doc3.markers?.[0].id).toBe(m2);
    expect(doc3.markers?.[1].id).toBe(m1);
    expect(doc3.markers?.[2].id).toBe(m3);
    expect(doc3.markers?.[0].color).toBe("green");

    // 2. Update marker
    const docUpdated = updateMarker(doc3, m1, { label: "Main segment", color: "purple" });
    const updated = docUpdated.markers?.find((m) => m.id === m1);
    expect(updated?.label).toBe("Main segment");
    expect(updated?.color).toBe("purple");

    // 3. Delete marker
    const docDeleted = deleteMarker(docUpdated, m2);
    expect(docDeleted.markers?.length).toBe(2);
    expect(docDeleted.markers?.some((m) => m.id === m2)).toBe(false);
  });
});
