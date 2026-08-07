import type { ParticipantMetrics, WinnerMetric, WinnerRule } from "./types";

function compareMetric(a: ParticipantMetrics, b: ParticipantMetrics, metric: WinnerMetric, direction: "highest" | "lowest"): number {
  const multiplier = direction === "highest" ? -1 : 1;
  if (metric === "reachedTargetAt") {
    const av = a.reachedTargetAt ? Date.parse(a.reachedTargetAt) : Number.POSITIVE_INFINITY;
    const bv = b.reachedTargetAt ? Date.parse(b.reachedTargetAt) : Number.POSITIVE_INFINITY;
    return av - bv;
  }
  return (a[metric] - b[metric]) * multiplier;
}

export function rankParticipants(participants: readonly ParticipantMetrics[], rule: WinnerRule): ParticipantMetrics[] {
  const metrics = [rule.primary, ...rule.tieBreakers];
  return [...participants].sort((a, b) => {
    for (const metric of metrics) {
      const result = compareMetric(a, b, metric, metric === "reachedTargetAt" ? "lowest" : (rule.direction ?? "highest"));
      if (result !== 0) return result;
    }
    return a.memberId.localeCompare(b.memberId);
  });
}
