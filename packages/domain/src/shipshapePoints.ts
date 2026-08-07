export interface ShipShapePointRules {
  completedTask: 1;
  missedTask: -3;
  perfectDayBonus: number;
  sevenDayStreakBonus: number;
  perfectDayTotal: number;
  allMissedTotal: number;
}

/**
 * Scales the original seven-task bonuses without changing the value of an
 * individual completed or missed task. Seven tasks remains +3/+5 exactly.
 */
export function getShipShapePointRules(taskCount: number): ShipShapePointRules {
  const normalizedTaskCount = Math.max(0, Math.floor(taskCount));
  if (normalizedTaskCount === 0) {
    return { completedTask: 1, missedTask: -3, perfectDayBonus: 0, sevenDayStreakBonus: 0, perfectDayTotal: 0, allMissedTotal: 0 };
  }

  const perfectDayBonus = Math.max(1, Math.round((normalizedTaskCount * 3) / 7));
  const sevenDayStreakBonus = Math.max(1, Math.round((normalizedTaskCount * 5) / 7));

  return {
    completedTask: 1,
    missedTask: -3,
    perfectDayBonus,
    sevenDayStreakBonus,
    perfectDayTotal: normalizedTaskCount + perfectDayBonus,
    allMissedTotal: normalizedTaskCount * -3,
  };
}
