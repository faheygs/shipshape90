import { describe, expect, it } from "vitest";
import { RealtimeEventDeduper } from "./realtimeEventDeduper";

const event = (eventId?: string) => ({ eventId, type: "score.day_submitted", payload: {} });

describe("RealtimeEventDeduper", () => {
  it("accepts an event once", () => {
    const deduper = new RealtimeEventDeduper();
    expect(deduper.shouldProcess(event("event-1"), 1_000)).toBe(true);
    expect(deduper.shouldProcess(event("event-1"), 1_001)).toBe(false);
  });

  it("does not suppress events without an id", () => {
    const deduper = new RealtimeEventDeduper();
    expect(deduper.shouldProcess(event(), 1_000)).toBe(true);
    expect(deduper.shouldProcess(event(), 1_001)).toBe(true);
  });

  it("expires old ids and caps retained entries", () => {
    const deduper = new RealtimeEventDeduper(2, 100);
    expect(deduper.shouldProcess(event("old"), 1_000)).toBe(true);
    expect(deduper.shouldProcess(event("second"), 1_010)).toBe(true);
    expect(deduper.shouldProcess(event("third"), 1_020)).toBe(true);
    expect(deduper.shouldProcess(event("old"), 1_021)).toBe(true);
    expect(deduper.shouldProcess(event("second"), 1_200)).toBe(true);
  });
});
