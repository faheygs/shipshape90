import type { ShipShapeRealtimeEvent } from "./realtimeClient";

const defaultMaxEntries = 500;
const defaultTtlMs = 10 * 60 * 1_000;

export class RealtimeEventDeduper {
  private readonly seenAt = new Map<string, number>();

  constructor(
    private readonly maxEntries = defaultMaxEntries,
    private readonly ttlMs = defaultTtlMs,
  ) {}

  shouldProcess(event: ShipShapeRealtimeEvent, now = Date.now()): boolean {
    if (!event.eventId) return true;
    this.prune(now);
    if (this.seenAt.has(event.eventId)) return false;
    this.seenAt.set(event.eventId, now);
    this.trimToLimit();
    return true;
  }

  clear() {
    this.seenAt.clear();
  }

  private prune(now: number) {
    for (const [eventId, timestamp] of this.seenAt) {
      if (now - timestamp <= this.ttlMs) break;
      this.seenAt.delete(eventId);
    }
  }

  private trimToLimit() {
    while (this.seenAt.size > this.maxEntries) {
      const oldest = this.seenAt.keys().next().value;
      if (!oldest) return;
      this.seenAt.delete(oldest);
    }
  }
}
