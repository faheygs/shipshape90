export interface RealtimeInvalidationTargets {
  activity: boolean;
  challenge: boolean;
  history: boolean;
  management: boolean;
  progress: boolean;
  score: boolean;
}

export function realtimeInvalidationTargets(eventType: string): RealtimeInvalidationTargets {
  const score = eventType.startsWith("score.") || eventType.startsWith("task.");
  const progress = eventType.startsWith("progress.");
  const membership = eventType.startsWith("member.") || eventType.startsWith("challenge.");
  const known = score || progress || membership;
  return {
    activity: true,
    challenge: membership || !known,
    history: score || progress || membership || !known,
    management: membership || !known,
    progress: progress || !known,
    score: score || progress || membership || !known,
  };
}
