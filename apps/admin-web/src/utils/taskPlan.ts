export type TaskPlanSettings = {
  requireWrongFirst: boolean;
  targetAccuracy: number;
  dailyLimit: number;
  paperIds: string[];
  entertainmentEnabled: boolean;
  entertainmentDailyLimitSeconds: number;
  entertainmentAllowedGames: string[];
};

export const TASK_PLAN_KEY = 'kidsQuiz.taskPlanSettings';
const API_BASE = 'http://localhost:3000';
export const ENTERTAINMENT_GAME_KEYS = ['2048', '24', 'sudoku', 'gomoku', 'memory'] as const;
export const ENTERTAINMENT_MIN_LIMIT_SECONDS = 60;
export const ENTERTAINMENT_MAX_LIMIT_SECONDS = 30 * 60;

export function normalizeEntertainmentLimitSeconds(value: unknown) {
  return Math.min(
    ENTERTAINMENT_MAX_LIMIT_SECONDS,
    Math.max(ENTERTAINMENT_MIN_LIMIT_SECONDS, Math.floor(Number(value || ENTERTAINMENT_MAX_LIMIT_SECONDS))),
  );
}

export const defaultTaskPlanSettings: TaskPlanSettings = {
  requireWrongFirst: true,
  targetAccuracy: 90,
  dailyLimit: 5,
  paperIds: [],
  entertainmentEnabled: true,
  entertainmentDailyLimitSeconds: 1800,
  entertainmentAllowedGames: [...ENTERTAINMENT_GAME_KEYS],
};

export function readTaskPlanSettings(): TaskPlanSettings {
  try {
    const raw = localStorage.getItem(TASK_PLAN_KEY);
    if (!raw) return defaultTaskPlanSettings;
    const parsed = JSON.parse(raw) as Partial<TaskPlanSettings>;
    return {
      requireWrongFirst: parsed.requireWrongFirst ?? defaultTaskPlanSettings.requireWrongFirst,
      targetAccuracy: Number(parsed.targetAccuracy || defaultTaskPlanSettings.targetAccuracy),
      dailyLimit: Number(parsed.dailyLimit || defaultTaskPlanSettings.dailyLimit),
      paperIds: Array.isArray(parsed.paperIds) ? parsed.paperIds.map(String) : [],
      entertainmentEnabled: parsed.entertainmentEnabled ?? defaultTaskPlanSettings.entertainmentEnabled,
      entertainmentDailyLimitSeconds: normalizeEntertainmentLimitSeconds(parsed.entertainmentDailyLimitSeconds),
      entertainmentAllowedGames: Array.isArray(parsed.entertainmentAllowedGames)
        ? parsed.entertainmentAllowedGames.map(String).filter((key) => (ENTERTAINMENT_GAME_KEYS as readonly string[]).includes(key))
        : [...ENTERTAINMENT_GAME_KEYS],
    };
  } catch {
    return defaultTaskPlanSettings;
  }
}

export function saveTaskPlanSettings(settings: TaskPlanSettings) {
  localStorage.setItem(TASK_PLAN_KEY, JSON.stringify(settings));
  void fetch(`${API_BASE}/admin/student/task-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }).catch(() => undefined);
}
