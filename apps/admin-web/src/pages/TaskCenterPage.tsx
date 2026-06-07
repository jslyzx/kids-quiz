import { useEffect, useMemo, useState } from 'react';
import { listStudentPapers as listPapers } from '../api/papers';
import { listStudentPaperStats as listPaperStats, listStudentRecentAttempts as listRecentAttempts, listStudentTagStats as listTagStats, listStudentWrongAnswers as listWrongAnswers } from '../api/submissions';
import { getChildTaskSettings as getTaskSettings } from '../api/student';
import { readTaskPlanSettings, type TaskPlanSettings } from '../utils/taskPlan';

type Props = {
  onHome: () => void;
  onStartPaper: (paperId: string) => void;
  onRetryWrong: () => void;
  onRetryTag: (tag: string) => void;
  onOpenWrongBook: () => void;
};

type PaperTask = {
  kind: 'paper';
  id: string;
  title: string;
  description?: string;
  itemCount: number;
  status: 'new' | 'review' | 'done';
  priority: number;
  accuracy?: number;
  wrong?: number;
  total?: number;
  completedToday: boolean;
};

type WrongTask = {
  kind: 'wrong';
  id: 'wrong-retry';
  title: string;
  description: string;
  count: number;
  priority: number;
  completedToday: boolean;
};

type TagTask = {
  kind: 'tag';
  id: string;
  title: string;
  description: string;
  tag: string;
  accuracy: number;
  total: number;
  wrong: number;
  priority: number;
  completedToday: boolean;
};

type StudyTask = PaperTask | WrongTask | TagTask;

function statusLabel(task: StudyTask) {
  if (task.completedToday) return '今日已完成';
  if (task.kind === 'wrong') return '优先复习';
  if (task.kind === 'tag') return '薄弱知识点';
  if (task.status === 'new') return '还没练过';
  if (task.status === 'review') return '需要巩固';
  return '已达标';
}

function taskReason(task: StudyTask) {
  if (task.completedToday) return '今天已经完成过，可以继续做下一个任务。';
  if (task.kind === 'wrong') return `当前有 ${task.count} 道错题，建议先重练。`;
  if (task.kind === 'tag') return `${task.tag} 正确率 ${task.accuracy}%，还有 ${task.wrong} 个错点，建议专项巩固。`;
  if (task.status === 'new') return '还没有练过，适合作为今天的新任务。';
  if (task.status === 'review') return `正确率 ${task.accuracy ?? 0}%，还有 ${task.wrong ?? 0} 道需要巩固。`;
  return `正确率 ${task.accuracy ?? 0}%，可以作为复习备选。`;
}

function isToday(value: unknown) {
  if (!value) return false;
  const date = new Date(String(value));
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function TaskCenterPage({ onHome, onStartPaper, onRetryWrong, onRetryTag, onOpenWrongBook }: Props) {
  const [papers, setPapers] = useState<any[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);
  const [tagStats, setTagStats] = useState<any[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [settings, setSettings] = useState<TaskPlanSettings>(() => readTaskPlanSettings());
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const [paperData, statData, wrongData, tagStatData, recentData, remoteSettings] = await Promise.all([
        listPapers(),
        listPaperStats(),
        listWrongAnswers(),
        listTagStats(),
        listRecentAttempts(),
        getTaskSettings().catch(() => null),
      ]);
      setPapers(paperData);
      setStatsMap(Object.fromEntries(statData.map((item) => [String(item.paperId), item])));
      setWrongAnswers(wrongData);
      setTagStats(tagStatData);
      setRecentAttempts(recentData);
      const nextSettings = remoteSettings ? { ...readTaskPlanSettings(), ...remoteSettings, paperIds: Array.isArray(remoteSettings.paperIds) ? remoteSettings.paperIds.map(String) : [] } : readTaskPlanSettings();
      localStorage.setItem('kidsQuiz.taskPlanSettings', JSON.stringify(nextSettings));
      setSettings(nextSettings);
      setMessage(`已安排 ${paperData.length} 套练习，错题 ${wrongData.length} 道`);
    } catch (error) {
      setMessage(`加载任务失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const tasks = useMemo<StudyTask[]>(() => {
    const list: StudyTask[] = [];
    const todayPaperIds = new Set(recentAttempts.filter((item) => item.source === 'PAPER' && isToday(item.submittedAt)).map((item) => String(item.paperId)));
    const wrongRetryDoneToday = recentAttempts.some((item) => item.source === 'WRONG_RETRY' && isToday(item.submittedAt));

    if (wrongAnswers.length) {
      list.push({
        kind: 'wrong',
        id: 'wrong-retry',
        title: '错题重练',
        description: '先把之前做错的题重新答一遍，做对就说明掌握了。',
        count: wrongAnswers.length,
        priority: wrongRetryDoneToday ? 900 : settings.requireWrongFirst ? 0 : 120,
        completedToday: wrongRetryDoneToday,
      });
    }

    tagStats
      .filter((item) => Number(item.total || 0) >= 3 && Number(item.accuracy || 0) < settings.targetAccuracy)
      .slice(0, 2)
      .forEach((item, index) => {
        list.push({
          kind: 'tag',
          id: `tag-${item.tag}`,
          title: `${item.tag} 专项巩固`,
          description: `这个知识点最近正确率 ${item.accuracy}%，建议从相关错题开始练。`,
          tag: item.tag,
          accuracy: Number(item.accuracy || 0),
          total: Number(item.total || 0),
          wrong: Number(item.wrong || 0),
          priority: 60 + index,
          completedToday: false,
        });
      });

    const orderedIds = settings.paperIds.length ? settings.paperIds : papers.map((paper) => String(paper.id));
    orderedIds
      .map((id) => papers.find((paper) => String(paper.id) === id))
      .filter(Boolean)
      .forEach((paper, index) => {
        const stat = statsMap[String(paper.id)];
        const accuracy = stat ? Number(stat.accuracy || 0) : undefined;
        const status: PaperTask['status'] = !stat ? 'new' : accuracy! >= settings.targetAccuracy ? 'done' : 'review';
        const completedToday = todayPaperIds.has(String(paper.id));
        list.push({
          kind: 'paper',
          id: String(paper.id),
          title: paper.title,
          description: paper.description,
          itemCount: paper.itemCount ?? paper.items?.length ?? 0,
          status,
          priority: completedToday ? 900 + index : status === 'new' ? 10 + index : status === 'review' ? 100 + index : 500 + index,
          accuracy,
          wrong: stat ? Number(stat.wrong || 0) : undefined,
          total: stat ? Number(stat.total || 0) : undefined,
          completedToday,
        });
      });

    return list.sort((a, b) => a.priority - b.priority).slice(0, Math.max(1, settings.dailyLimit || 5));
  }, [papers, recentAttempts, settings, statsMap, tagStats, wrongAnswers.length]);

  const nextTask = tasks.find((task) => !task.completedToday) || tasks[0];
  const doneCount = tasks.filter((task) => task.kind === 'paper' && task.status === 'done').length;
  const reviewCount = tasks.filter((task) => task.kind === 'paper' && task.status === 'review').length;
  const newCount = tasks.filter((task) => task.kind === 'paper' && task.status === 'new').length;
  const completedTodayCount = tasks.filter((task) => task.completedToday).length;

  const startTask = (task: StudyTask) => {
    if (task.kind === 'wrong') onRetryWrong();
    else if (task.kind === 'tag') onRetryTag(task.tag);
    else onStartPaper(task.id);
  };

  return <div className="app taskCenter">
    <header>
      <h1>Kids Quiz 今日任务</h1>
      <p>按家长设置的规则自动安排：目标正确率 {settings.targetAccuracy}%，每天最多 {settings.dailyLimit} 项。</p>
    </header>
    <main className="singleMain">
      <section className="panel">
        <div className="toolbar">
          <button onClick={onHome}>孩子首页</button>
          <button onClick={refresh}>{loading ? '加载中...' : '刷新任务'}</button>
          <button className="secondary" onClick={onOpenWrongBook}>查看错题本</button>
        </div>
        {message && <p className="message">{message}</p>}

        <div className="taskHero">
          <div>
            <span className="taskBadge">下一步</span>
            <h2>{nextTask ? nextTask.title : '暂无任务'}</h2>
            <p>{nextTask ? taskReason(nextTask) : '先去家长后台新建一套试卷吧。'}</p>
          </div>
          {nextTask ? <button onClick={() => startTask(nextTask)}>开始当前任务</button> : <button disabled>暂无任务</button>}
        </div>

        <div className="recordSummary taskStats">
          <div><b>{newCount}</b><span>新练习</span></div>
          <div><b>{reviewCount}</b><span>待巩固</span></div>
          <div><b>{wrongAnswers.length}</b><span>错题</span></div>
          <div><b>{completedTodayCount}</b><span>今日完成</span></div>
          <div><b>{doneCount}</b><span>已达标</span></div>
        </div>

        <h2>任务队列</h2>
        <div className="taskList">
          {tasks.map((task, index) => <div className={`taskCard ${task.completedToday ? 'completed' : task.kind === 'wrong' ? 'urgent' : task.kind === 'tag' ? 'review' : task.status}`} key={task.id}>
            <div className="taskIndex">{index + 1}</div>
            <div className="taskBody">
              <div className="taskTitleRow">
                <b>{task.title}</b>
                <span>{statusLabel(task)}</span>
              </div>
              <p>{task.kind === 'wrong' ? task.description : task.description || '暂无说明'}</p>
              <div className="taskMeta">
                {task.kind === 'wrong'
                  ? <><span>{task.count} 道错题</span><span>{task.completedToday ? '今天已重练' : '建议优先完成'}</span></>
                  : task.kind === 'tag'
                    ? <><span>知识点：{task.tag}</span><span>正确率 {task.accuracy}%</span><span>错点 {task.wrong}</span></>
                    : <><span>{task.itemCount} 道大题</span><span>{task.total ? `已练 ${task.total} 题次` : '还没练过'}</span><span>{task.accuracy !== undefined ? `正确率 ${task.accuracy}%` : '正确率 -'}</span>{task.completedToday && <span>今天已完成</span>}</>}
              </div>
            </div>
            <button onClick={() => startTask(task)}>{task.completedToday ? '再做一次' : task.kind === 'wrong' ? '开始重练' : task.kind === 'tag' ? '专项重练' : task.status === 'done' ? '再练一次' : '开始练习'}</button>
          </div>)}
          {!tasks.length && <p className="tip">暂无任务。请先到家长后台创建试卷并添加题目。</p>}
        </div>
      </section>
    </main>
  </div>;
}
