import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "shipshape:task-selection-draft:v1";

export function taskSelectionDraftKey(userId: string, challengeId: string, localDate: string): string {
  return `${STORAGE_PREFIX}:${userId}:${challengeId}:${localDate}`;
}

export function reconcileTaskSelectionDraft(selectedIds: string[], pendingIds: string[]): string[] {
  const pending = new Set(pendingIds);
  return [...new Set(selectedIds)].filter((id) => pending.has(id));
}

export async function loadTaskSelectionDraft(storageKey: string): Promise<string[]> {
  const stored = await AsyncStorage.getItem(storageKey);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    await AsyncStorage.removeItem(storageKey);
    return [];
  }
}

export async function saveTaskSelectionDraft(storageKey: string, selectedIds: string[]): Promise<void> {
  if (!selectedIds.length) {
    await AsyncStorage.removeItem(storageKey);
    return;
  }

  await AsyncStorage.setItem(storageKey, JSON.stringify([...new Set(selectedIds)]));
}
