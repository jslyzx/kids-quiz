export type TaskPlanSettings = {
  requireWrongFirst: boolean;
  targetAccuracy: number;
  dailyLimit: number;
  paperIds: string[];
};

export const TASK_PLAN_KEY = 'kidsQuiz.taskPlanSettings';
const API_BASE = 'http://localhost:3000';

export const defaultTaskPlanSettings: TaskPlanSettings = {
  requireWrongFirst: true,
  targetAccuracy: 90,
  dailyLimit: 5,
  paperIds: [],
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
