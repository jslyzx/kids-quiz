export type RewardState = {
  stars: number;
  streakDays: number;
  lastPracticeDate?: string;
  badges: string[];
  catalog?: Array<{ id: string; title: string; cost: number; description?: string; enabled: boolean }>;
  redemptions?: Array<{ id: string; rewardId: string; title: string; cost: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; requestedAt: string; confirmedAt?: string }>;
};

export type RewardGrant = {
  stars: number;
  streakDays: number;
  newBadges: string[];
  totalStars?: number;
  badges?: string[];
  lastPracticeDate?: string;
};

const REWARD_KEY = 'kidsQuiz.rewardState';
const API_BASE = 'http://localhost:3000';

export const badgeLabels: Record<string, string> = {
  first_practice: '第一次练习',
  accuracy_90: '正确率 90%+',
  accuracy_100: '满分小达人',
  streak_3: '连续 3 天',
  streak_7: '连续 7 天',
  stars_100: '100 颗星',
};

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return todayKey(date);
}

export function readRewardState(): RewardState {
  try {
    const raw = localStorage.getItem(REWARD_KEY);
    if (!raw) return { stars: 0, streakDays: 0, badges: [] };
    const parsed = JSON.parse(raw) as Partial<RewardState>;
    return {
      stars: Number(parsed.stars || 0),
      streakDays: Number(parsed.streakDays || 0),
      lastPracticeDate: parsed.lastPracticeDate,
      badges: Array.isArray(parsed.badges) ? parsed.badges : [],
      catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
      redemptions: Array.isArray(parsed.redemptions) ? parsed.redemptions : [],
    };
  } catch {
    return { stars: 0, streakDays: 0, badges: [] };
  }
}

export function writeRewardState(state: RewardState) {
  localStorage.setItem(REWARD_KEY, JSON.stringify(state));
}

export function applyRewardSnapshot(reward: RewardGrant) {
  const current = readRewardState();
  const nextState: RewardState = {
    stars: Number(reward.totalStars ?? current.stars + Number(reward.stars || 0)),
    streakDays: Number(reward.streakDays ?? current.streakDays ?? 0),
    lastPracticeDate: reward.lastPracticeDate ?? todayKey(),
    badges: Array.isArray(reward.badges) ? reward.badges : current.badges,
  };
  writeRewardState(nextState);
  return nextState;
}

export function grantPracticeReward(input: { accuracy: number; correct: number; total: number }): RewardGrant {
  const state = readRewardState();
  const today = todayKey();
  const practicedToday = state.lastPracticeDate === today;
  const nextStreak = practicedToday ? state.streakDays : state.lastPracticeDate === yesterdayKey() ? state.streakDays + 1 : 1;
  const earned = Math.max(1, Math.round(input.correct * 2 + (input.accuracy >= 90 ? 5 : input.accuracy >= 70 ? 3 : 1)));
  const badges = new Set(state.badges);
  const before = new Set(badges);

  if (!state.lastPracticeDate) badges.add('first_practice');
  if (input.accuracy >= 90) badges.add('accuracy_90');
  if (input.total > 0 && input.accuracy === 100) badges.add('accuracy_100');
  if (nextStreak >= 3) badges.add('streak_3');
  if (nextStreak >= 7) badges.add('streak_7');
  if (state.stars + earned >= 100) badges.add('stars_100');

  const nextState: RewardState = {
    stars: state.stars + earned,
    streakDays: nextStreak,
    lastPracticeDate: today,
    badges: Array.from(badges),
  };
  writeRewardState(nextState);
  void fetch(`${API_BASE}/admin/student/rewards`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextState),
  }).catch(() => undefined);
  return {
    stars: earned,
    streakDays: nextStreak,
    newBadges: nextState.badges.filter((badge) => !before.has(badge)),
  };
}
