import { useEffect, useMemo, useState } from 'react';
import { bulkAddQuestionGroupTags, bulkApplyQuestionGroupDefaults, bulkNormalizeLegacyQuestionGroups, bulkRemoveQuestionGroupTags, bulkUpdateQuestionGroupStatus, exportQuestionBank } from '../api/questionGroups';
import { addPaperQuestionGroup, createPaper } from '../api/papers';
import { looksLikeMojibake } from '../utils/textQuality';

type Severity = 'critical' | 'warning' | 'info';

type AuditIssue = {
  id: string;
  groupId: string;
  questionId?: string;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  suggestion: string;
};

type Props = {
  onBack: () => void;
  onEdit: (id: string, repairQueue?: string[]) => void;
  onImportJson: () => void;
  onOpenImportBatches: () => void;
  onOpenPaper: (paperId: string) => void;
  onStartPaper: (paperId: string) => void;
};

const severityLabel: Record<Severity, string> = {
  critical: '必须修',
  warning: '建议修',
  info: '可关注',
};

const severityClass: Record<Severity, string> = {
  critical: 'danger',
  warning: 'warning',
  info: 'muted',
};

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeText(value: unknown): string {
  return textOf(value)
    .replace(/\{\{math:(.+?)\}\}/g, '$1')
    .replace(/\\\((.+?)\\\)/g, '$1')
    .replace(/\\\[(.+?)\\\]/g, '$1')
    .replace(/\{\{blank(?::[^}]+)?\}\}/g, '____')
    .replace(/\{_[0-9]+\}/g, '____')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function visibleStem(group: any, question?: any): string {
  const source = question?.stem || group?.commonStem || group?.title || '';
  const text = textOf(source)
    .replace(/\{\{blank(?::[^}]+)?\}\}/g, '____')
    .replace(/\{_[0-9]+\}/g, '____')
    .replace(/\{\{math:(.+?)\}\}/g, '$1')
    .replace(/\\\((.+?)\\\)/g, '$1')
    .replace(/\\\[(.+?)\\\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

function collectAnswerValues(question: any): string {
  return (question.answerSlots ?? []).map((slot: any) => textOf(slot.correctAnswer)).join('|');
}

function collectOptions(question: any) {
  const dbOptions = Array.isArray(question?.options)
    ? question.options.map((option: any) => ({
      key: textOf(option.optionKey ?? option.key),
      text: textOf(option.content ?? option.text),
    }))
    : [];
  const contentOptions = Array.isArray(question?.content?.options)
    ? question.content.options.map((option: any) => ({
      key: textOf(option.key ?? option.optionKey),
      text: textOf(option.text ?? option.content),
    }))
    : [];
  const map = new Map<string, { key: string; text: string }>();
  for (const option of [...dbOptions, ...contentOptions]) {
    if (option.key || option.text) map.set(option.key || option.text, option);
  }
  return Array.from(map.values());
}

function buildQuestionSignature(group: any): string {
  const parts = (group.questions ?? []).map((question: any) => [
    normalizeText(question.stem),
    normalizeText(question.questionType),
    normalizeText(collectOptions(question).map((option: any) => `${option.key}:${option.text}`).join('|')),
    normalizeText(collectAnswerValues(question)),
  ].join('::'));
  return [normalizeText(group.groupType), ...parts].join('##');
}

function countBlankPlaceholders(stem: string): number {
  const modern = stem.match(/\{\{blank(?::[^}]+)?\}\}/g)?.length ?? 0;
  const legacy = stem.match(/\{_[0-9]+\}/g)?.length ?? 0;
  return modern + legacy;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function hasExplanation(question: any): boolean {
  return Boolean(textOf(question?.explanation).trim() || textOf(question?.content?.explanationHtml).trim());
}

function hasTag(group: any, tag: string) {
  return asArray(group?.tags).map(String).includes(tag);
}

function collectUrls(value: unknown, urls: string[] = []) {
  if (!value || typeof value !== 'object') return urls;
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
    return urls;
  }
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'url' || key === 'src') && typeof item === 'string') urls.push(item);
    else collectUrls(item, urls);
  }
  return urls;
}

function mentionsVisualMaterial(value: unknown) {
  return /图|钟面|尺|线段|票价|表格|看图|下面/.test(textOf(value));
}

function materialCount(question: any, group: any) {
  return asArray(question?.content?.materials).length + asArray(group?.content?.materials).length + (group?.content?.table ? 1 : 0);
}

function auditBank(bank: any) {
  const groups = asArray(bank?.groups);
  const issues: AuditIssue[] = [];
  const duplicateMap = new Map<string, any[]>();

  const addIssue = (issue: Omit<AuditIssue, 'id'>) => {
    issues.push({ ...issue, id: `${issue.groupId}-${issue.questionId ?? 'group'}-${issues.length}` });
  };

  for (const group of groups) {
    const groupId = String(group.id);
    const questions = asArray(group.questions);
    const tags = asArray(group.tags).map(String).filter(Boolean);

    if (!questions.length) {
      addIssue({
        groupId,
        severity: 'critical',
        category: '结构',
        title: '题组没有小题',
        detail: `题组「${group.title || groupId}」下没有任何小题。`,
        suggestion: '编辑题组补充小题，或停用这个题组。',
      });
    }

    if (!tags.length) {
      addIssue({
        groupId,
        severity: 'warning',
        category: '标签',
        title: '缺少标签/知识点',
        detail: `题组「${group.title || groupId}」没有标签，后续知识点统计会不够准确。`,
        suggestion: '至少补充一个知识点标签，例如：表内乘法、万以内数、古诗。',
      });
    }

    if (!textOf(group.gradeLevel).trim()) {
      addIssue({
        groupId,
        severity: 'info',
        category: '年级',
        title: '未设置年级',
        detail: `题组「${group.title || groupId}」未设置年级。`,
        suggestion: '建议设置年级，方便孩子按年级筛选练习。',
      });
    }

    if (group.status === 'DISABLED') {
      addIssue({
        groupId,
        severity: 'info',
        category: '状态',
        title: '题组已停用',
        detail: `题组「${group.title || groupId}」当前为停用状态。`,
        suggestion: '如果是误停用，可以在题库列表重新启用。',
      });
    }

    if (hasTag(group, '待验收')) {
      addIssue({
        groupId,
        severity: 'info',
        category: '验收',
        title: '导入后待验收',
        detail: `题组「${group.title || groupId}」带有「待验收」标签。`,
        suggestion: '建议生成验收试卷，孩子端逐题试做，确认展示、交互和答案无误后再移除标签。',
      });
    }

    if (hasTag(group, '需修复')) {
      addIssue({
        groupId,
        severity: 'warning',
        category: '修复',
        title: '已加入修复队列',
        detail: `题组「${group.title || groupId}」带有「需修复」标签。`,
        suggestion: '优先打开编辑页面修正题干、答案、公式或交互问题，修好后移除「需修复」标签。',
      });
    }

    const signature = buildQuestionSignature(group);
    if (signature && signature.length > 12) {
      duplicateMap.set(signature, [...(duplicateMap.get(signature) ?? []), group]);
    }

    for (const question of questions) {
      const questionId = String(question.id);
      const stem = textOf(question.stem);
      const answerSlots = asArray(question.answerSlots);
      const options = collectOptions(question);
      const questionType = textOf(question.questionType);

      if (!stem.trim() && !textOf(group.commonStem).trim() && group.groupType !== 'MENTAL_MATH') {
        addIssue({
          groupId,
          questionId,
          severity: 'critical',
          category: '题干',
          title: '题干为空',
          detail: `小题 ${questionId} 没有题干内容。`,
          suggestion: '补充题干，或者确认它是否应作为复合题小题展示。',
        });
      }

      if (!answerSlots.length) {
        addIssue({
          groupId,
          questionId,
          severity: 'critical',
          category: '答案',
          title: '没有答案槽',
          detail: `小题 ${questionId} 没有 answerSlots，孩子提交后无法判断正误。`,
          suggestion: '为这道题补充答案槽和正确答案。',
        });
      }

      const isColumnArithmetic = question.content?.interaction === 'column_arithmetic' || Boolean(question.content?.columnArithmetic);
      const seenSlotKeys = new Set<string>();
      for (const slot of answerSlots) {
        const key = textOf(slot.slotKey);
        const answers = asArray(slot.correctAnswer);

        if (!key.trim()) {
          addIssue({
            groupId,
            questionId,
            severity: 'critical',
            category: '答案',
            title: '答案槽缺少 slotKey',
            detail: `小题 ${questionId} 存在没有 slotKey 的答案槽。`,
            suggestion: '补充 slotKey，例如 blank_0、choice、order。',
          });
        } else if (seenSlotKeys.has(key)) {
          addIssue({
            groupId,
            questionId,
            severity: 'critical',
            category: '答案',
            title: '答案槽 key 重复',
            detail: `小题 ${questionId} 的 slotKey「${key}」重复。`,
            suggestion: '把重复的 slotKey 改成唯一值。',
          });
        }
        seenSlotKeys.add(key);

        if (!isColumnArithmetic && (!answers.length || answers.every((answer) => textOf(answer).trim() === ''))) {
          addIssue({
            groupId,
            questionId,
            severity: 'critical',
            category: '答案',
            title: '正确答案为空',
            detail: `小题 ${questionId} 的答案槽「${key || '未命名'}」没有正确答案。`,
            suggestion: '补充 correctAnswer，否则无法自动判分。',
          });
        }
      }

      const blankCount = countBlankPlaceholders(stem);
      const blankSlotCount = answerSlots.filter((slot: any) => /^blank/i.test(textOf(slot.slotKey)) || textOf(slot.slotType) === 'TEXT' || textOf(slot.slotType) === 'NUMBER').length;
      if (blankCount > 0 && blankSlotCount < blankCount) {
        addIssue({
          groupId,
          questionId,
          severity: 'critical',
          category: '填空',
          title: '空位数量和答案数量不匹配',
          detail: `题干中检测到 ${blankCount} 个空位，但疑似只有 ${blankSlotCount} 个填空答案槽。`,
          suggestion: '检查题干里的 {{blank:1}} 和 answerSlots 是否一一对应。',
        });
      }

      if (/\\\(|\\\[|\{_[0-9]+\}/.test(stem)) {
        addIssue({
          groupId,
          questionId,
          severity: 'warning',
          category: '格式',
          title: '仍包含旧格式公式或空位',
          detail: `题干「${visibleStem(group, question)}」中仍有旧格式。`,
          suggestion: '建议转换为 {{math:...}} 和 {{blank:1}}，避免展示异常。',
        });
      }

      const searchablePayload = [group.title, group.commonStem, group.content, question.stem, question.content, question.explanation, question.options, question.answerSlots];
      if (searchablePayload.some(looksLikeMojibake)) {
        addIssue({
          groupId,
          questionId,
          severity: 'warning',
          category: '乱码',
          title: '疑似编码乱码',
          detail: `小题「${visibleStem(group, question) || questionId}」中检测到常见 mojibake 字符。`,
          suggestion: '检查源 JSON 是否为 UTF-8，必要时重新 OCR 或从规范化 JSON 重新导入。',
        });
      }

      const urls = collectUrls({ groupContent: group.content, questionContent: question.content, explanation: question.explanation });
      const badUrls = urls.filter((url) => {
        const text = String(url ?? '').trim();
        if (!text) return true;
        return !/^https?:\/\//.test(text) && !text.startsWith('/uploads/');
      });
      if (badUrls.length) {
        addIssue({
          groupId,
          questionId,
          severity: 'critical',
          category: '图片',
          title: '图片 URL 格式异常',
          detail: `检测到无法稳定访问的图片地址：${badUrls.join('、')}`,
          suggestion: '图片建议放入 apps/api/uploads，并使用 /uploads/xxx 或 http://localhost:3000/uploads/xxx。',
        });
      }

      if (mentionsVisualMaterial(stem) && materialCount(question, group) === 0) {
        addIssue({
          groupId,
          questionId,
          severity: 'warning',
          category: '材料',
          title: '题干像是依赖图片/材料但未配置材料',
          detail: `题干「${visibleStem(group, question)}」提到图、钟面、尺或票价等材料，但未检测到 materials/table。`,
          suggestion: '补充 content.materials 或确认题干已经包含完整信息。',
        });
      }

      if ((questionType === 'SINGLE_CHOICE' || questionType === 'MULTIPLE_CHOICE') && !options.length) {
        addIssue({
          groupId,
          questionId,
          severity: 'critical',
          category: '选择题',
          title: '选择题没有选项',
          detail: `小题 ${questionId} 是选择题，但没有 options。`,
          suggestion: '补充 A、B、C、D 等选项。',
        });
      }

      if (options.length) {
        const optionKeys = new Set(options.map((option: any) => textOf(option.key)));
        for (const slot of answerSlots) {
          for (const answer of asArray(slot.correctAnswer)) {
            if (typeof answer === 'string' && /^[A-Z0-9]+$/.test(answer) && !optionKeys.has(answer)) {
              addIssue({
                groupId,
                questionId,
                severity: 'critical',
                category: '选择题',
                title: '答案不在选项中',
                detail: `正确答案「${answer}」不在选项 key 中。`,
                suggestion: '检查选项 key 和 correctAnswer 是否一致。',
              });
            }
          }
        }
      }

      if ((questionType === 'MATCHING' || answerSlots.some((slot: any) => textOf(slot.slotType) === 'MATCH')) && answerSlots.length) {
        const matchSlot = answerSlots.find((slot: any) => textOf(slot.slotType) === 'MATCH') ?? answerSlots[0];
        const matches = asArray(matchSlot.correctAnswer);
        if (!matches.length || matches.some((pair: any) => !pair || !('left' in pair) || !('right' in pair))) {
          addIssue({
            groupId,
            questionId,
            severity: 'critical',
            category: '连线题',
            title: '连线答案结构异常',
            detail: `小题 ${questionId} 的连线答案不是 { left, right } 数组。`,
            suggestion: '按导入格式文档修正 matching.correctAnswer。',
          });
        }
      }

      if (!hasExplanation(question)) {
        addIssue({
          groupId,
          questionId,
          severity: 'info',
          category: '解析',
          title: '缺少解题解析',
          detail: `小题「${visibleStem(group, question) || questionId}」还没有解析。`,
          suggestion: '建议给易错题、应用题和古诗题补充解析，孩子错题后能看懂原因。',
        });
      }
    }
  }

  for (const duplicateGroups of duplicateMap.values()) {
    if (duplicateGroups.length < 2) continue;
    const ids = duplicateGroups.map((group) => String(group.id));
    for (const group of duplicateGroups) {
      addIssue({
        groupId: String(group.id),
        severity: 'warning',
        category: '重复',
        title: '疑似重复题',
        detail: `与题组 ${ids.filter((id) => id !== String(group.id)).join('、')} 内容高度相似。`,
        suggestion: '打开对比题干和答案，确认是否需要停用或合并。',
      });
    }
  }

  const questionCount = groups.reduce((sum: number, group: any) => sum + asArray(group.questions).length, 0);
  const explanationQuestionCount = groups.reduce((sum: number, group: any) => sum + asArray(group.questions).filter(hasExplanation).length, 0);

  return {
    groups,
    issues,
    stats: {
      groupCount: groups.length,
      enabledCount: groups.filter((group: any) => group.status !== 'DISABLED').length,
      disabledCount: groups.filter((group: any) => group.status === 'DISABLED').length,
      questionCount,
      criticalCount: issues.filter((issue) => issue.severity === 'critical').length,
      warningCount: issues.filter((issue) => issue.severity === 'warning').length,
      infoCount: issues.filter((issue) => issue.severity === 'info').length,
      explanationCoverage: questionCount ? Math.round((explanationQuestionCount / questionCount) * 100) : 0,
    },
  };
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function uniqueGroupIds(issues: AuditIssue[]) {
  return Array.from(new Set(issues.map((issue) => issue.groupId)));
}

function duplicateClusters(groups: any[]) {
  const map = new Map<string, any[]>();
  for (const group of groups) {
    const signature = buildQuestionSignature(group);
    if (!signature || signature.length <= 12) continue;
    map.set(signature, [...(map.get(signature) ?? []), group]);
  }
  return Array.from(map.values()).filter((items) => items.length > 1);
}

function timeValue(value: unknown) {
  const time = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

type Recommendation = {
  key: string;
  title: string;
  desc: string;
  issueCount: number;
  groupCount: number;
  severity: Severity;
  actionText: string;
  run?: () => void;
  filter: () => void;
};

export function QuestionAuditPage({ onBack, onEdit, onImportJson, onOpenImportBatches, onOpenPaper, onStartPaper }: Props) {
  const [bank, setBank] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState<'ALL' | Severity>('ALL');
  const [category, setCategory] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>({});
  const [bulkTagsText, setBulkTagsText] = useState('');
  const [creatingPaper, setCreatingPaper] = useState(false);
  const [paperId, setPaperId] = useState('');

  const refresh = async () => {
    try {
      setLoading(true);
      setMessage('正在扫描题库...');
      const data = await exportQuestionBank();
      setBank(data);
      setMessage(`体检完成：共扫描 ${data.count ?? data.groups?.length ?? 0} 个题组。`);
    } catch (error) {
      setMessage(`体检失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const result = useMemo(() => auditBank(bank), [bank]);
  const categories = useMemo(() => ['ALL', ...Array.from(new Set(result.issues.map((issue) => issue.category)))], [result.issues]);

  const filteredIssues = useMemo(() => {
    const kw = keyword.trim();
    return result.issues.filter((issue) => {
      const matchSeverity = severity === 'ALL' || issue.severity === severity;
      const matchCategory = category === 'ALL' || issue.category === category;
      const haystack = `${issue.groupId} ${issue.questionId ?? ''} ${issue.title} ${issue.detail} ${issue.suggestion}`;
      const matchKeyword = !kw || haystack.includes(kw);
      return matchSeverity && matchCategory && matchKeyword;
    });
  }, [result.issues, severity, category, keyword]);

  const visibleGroupIds = useMemo(() => uniqueGroupIds(filteredIssues), [filteredIssues]);
  const selectedGroupIds = useMemo(() => Object.entries(selectedGroups).filter(([, selected]) => selected).map(([id]) => id), [selectedGroups]);
  const pendingGroupIds = useMemo(() => result.groups.filter((group: any) => hasTag(group, '待验收')).map((group: any) => String(group.id)), [result.groups]);
  const repairGroupIds = useMemo(() => result.groups.filter((group: any) => hasTag(group, '需修复')).map((group: any) => String(group.id)), [result.groups]);
  const duplicateGroupIds = useMemo(() => Array.from(new Set(duplicateClusters(result.groups).flatMap((items) => items.map((group) => String(group.id))))), [result.groups]);

  const setQuickFilter = (nextSeverity: 'ALL' | Severity, nextCategory = 'ALL') => {
    setSeverity(nextSeverity);
    setCategory(nextCategory);
    setKeyword('');
  };

  const toggleGroup = (id: string, checked: boolean) => {
    setSelectedGroups((prev) => ({ ...prev, [id]: checked }));
  };

  const selectVisibleGroups = () => {
    setSelectedGroups((prev) => {
      const next = { ...prev };
      visibleGroupIds.forEach((id) => { next[id] = true; });
      return next;
    });
  };

  const clearSelection = () => setSelectedGroups({});

  const bulkDisable = async () => {
    if (!selectedGroupIds.length) {
      setMessage('请先选择要处理的题组。');
      return;
    }
    try {
      const result = await bulkUpdateQuestionGroupStatus(selectedGroupIds, 'DISABLED');
      setMessage(`已批量停用 ${result.count} 个题组。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`批量停用失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const bulkEnable = async () => {
    if (!selectedGroupIds.length) {
      setMessage('请先选择要处理的题组。');
      return;
    }
    try {
      const result = await bulkUpdateQuestionGroupStatus(selectedGroupIds, 'ENABLED');
      setMessage(`已批量启用 ${result.count} 个题组。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`批量启用失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const bulkAddTags = async () => {
    const tags = bulkTagsText.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
    if (!selectedGroupIds.length) {
      setMessage('请先选择要处理的题组。');
      return;
    }
    if (!tags.length) {
      setMessage('请输入要追加的标签。');
      return;
    }
    try {
      const result = await bulkAddQuestionGroupTags(selectedGroupIds, tags);
      setMessage(`已为 ${result.count} 个题组追加标签：${tags.join('、')}`);
      setBulkTagsText('');
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`批量追加标签失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const autoFixSimpleIssues = async () => {
    const ids = Array.from(new Set(
      filteredIssues
        .filter((issue) => issue.category === '标签' || issue.category === '年级')
        .map((issue) => issue.groupId),
    ));
    if (!ids.length) {
      setMessage('当前筛选下没有可自动修复的缺标签/缺年级题组。');
      return;
    }
    try {
      const result = await bulkApplyQuestionGroupDefaults(ids, { gradeLevel: '二年级', addMissingTags: true });
      setMessage(`已执行自动修复建议：补年级 ${result.gradeFixed} 个，补默认标签 ${result.tagFixed} 个。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`自动修复失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const autoNormalizeLegacyFormat = async () => {
    const ids = Array.from(new Set(
      filteredIssues
        .filter((issue) => issue.category === '格式')
        .map((issue) => issue.groupId),
    ));
    if (!ids.length) {
      setMessage('当前筛选下没有旧格式公式/空位问题。');
      return;
    }
    try {
      const result = await bulkNormalizeLegacyQuestionGroups(ids);
      setMessage(`已转换旧格式：题组材料 ${result.groupFixed} 个，小题 ${result.questionFixed} 道，答案槽 ${result.slotFixed} 个，选项 ${result.optionFixed} 个。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`旧格式转换失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const disableDuplicateGroups = async (keep: 'newest' | 'oldest') => {
    const losers = duplicateClusters(result.groups).flatMap((items) => {
      const activeItems = items.filter((group) => group.status !== 'DISABLED');
      if (activeItems.length <= 1) return [];
      const sorted = [...activeItems].sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt));
      const keepGroup = keep === 'oldest' ? sorted[0] : sorted[sorted.length - 1];
      return sorted.filter((group) => String(group.id) !== String(keepGroup.id)).map((group) => String(group.id));
    });
    const uniqueIds = Array.from(new Set(losers));
    if (!uniqueIds.length) {
      setMessage('当前没有需要停用的重复题，或者每组重复题只剩一个启用项。');
      return;
    }
    try {
      const result = await bulkUpdateQuestionGroupStatus(uniqueIds, 'DISABLED');
      setMessage(`已停用 ${result.count} 个疑似重复题组，保留${keep === 'newest' ? '最新' : '最早'}题。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`停用重复题失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const bulkMarkReviewed = async (mode: 'selected' | 'pending') => {
    const ids = mode === 'pending' ? pendingGroupIds : selectedGroupIds;
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      setMessage(mode === 'pending' ? '当前没有待验收题组。' : '请先选择要处理的题组。');
      return;
    }
    try {
      const result = await bulkRemoveQuestionGroupTags(uniqueIds, ['待验收']);
      setMessage(`已将 ${result.count} 个题组标记为验收通过，并移除「待验收」标签。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`标记验收通过失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const bulkMarkNeedRepair = async () => {
    if (!selectedGroupIds.length) {
      setMessage('请先选择要加入修复队列的题组。');
      return;
    }
    try {
      const result = await bulkAddQuestionGroupTags(selectedGroupIds, ['需修复']);
      setMessage(`已将 ${result.count} 个题组加入修复队列。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`加入修复队列失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const bulkMarkRepaired = async (mode: 'selected' | 'repair') => {
    const ids = mode === 'repair' ? repairGroupIds : selectedGroupIds;
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      setMessage(mode === 'repair' ? '当前没有需修复题组。' : '请先选择已修复的题组。');
      return;
    }
    try {
      const result = await bulkRemoveQuestionGroupTags(uniqueIds, ['需修复']);
      setMessage(`已将 ${result.count} 个题组标记为修复完成，并移除「需修复」标签。`);
      clearSelection();
      await refresh();
    } catch (error) {
      setMessage(`标记修复完成失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const createReviewPaper = async (mode: 'pending' | 'selected' | 'visible') => {
    const ids = mode === 'pending' ? pendingGroupIds : mode === 'selected' ? selectedGroupIds : visibleGroupIds;
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      setMessage(mode === 'pending' ? '当前没有待验收题组。' : '当前没有可生成验收卷的题组。');
      return;
    }
    try {
      setCreatingPaper(true);
      setPaperId('');
      const paper = await createPaper({
        title: `待验收题目验收试卷 ${new Date().toLocaleString()}`,
        description: `由题库体检中心生成，包含 ${uniqueIds.length} 个题组，用于检查 OCR/JSON 导入后的题目展示、交互和答案。JSON 导入页自动生成`,
      });
      for (const groupId of uniqueIds) {
        await addPaperQuestionGroup(String(paper.id), groupId);
      }
      setPaperId(String(paper.id));
      setMessage(`已生成验收试卷：${paper.id}，共加入 ${uniqueIds.length} 个题组。`);
    } catch (error) {
      setMessage(`生成验收试卷失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreatingPaper(false);
    }
  };

  const exportReport = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`kids-quiz-audit-report-${date}.json`, {
      exportedAt: new Date().toISOString(),
      stats: result.stats,
      recommendations: recommendations.map((item) => ({
        key: item.key,
        title: item.title,
        severity: item.severity,
        issueCount: item.issueCount,
        groupCount: item.groupCount,
        actionText: item.actionText,
      })),
      categorySummary,
      issues: result.issues,
    });
  };

  const categorySummary = useMemo(() => {
    const map = new Map<string, { category: string; issues: AuditIssue[]; groups: string[]; critical: number; warning: number; info: number }>();
    for (const issue of result.issues) {
      const item = map.get(issue.category) ?? { category: issue.category, issues: [], groups: [], critical: 0, warning: 0, info: 0 };
      item.issues.push(issue);
      if (!item.groups.includes(issue.groupId)) item.groups.push(issue.groupId);
      item[issue.severity] += 1;
      map.set(issue.category, item);
    }
    const score = (item: { critical: number; warning: number; info: number }) => item.critical * 100 + item.warning * 10 + item.info;
    return Array.from(map.values()).sort((a, b) => score(b) - score(a));
  }, [result.issues]);

  const recommendations = useMemo<Recommendation[]>(() => {
    const count = (categoryName: string) => {
      const issues = result.issues.filter((issue) => issue.category === categoryName);
      return { issueCount: issues.length, groupCount: uniqueGroupIds(issues).length };
    };
    const criticalAnswer = result.issues.filter((issue) => issue.severity === 'critical' && ['答案', '填空', '选择题', '连线题'].includes(issue.category));
    const format = count('格式');
    const duplicate = count('重复');
    const repair = count('修复');
    const explanation = count('解析');
    const metadataIssues = result.issues.filter((issue) => issue.category === '标签' || issue.category === '年级');
    return [
      {
        key: 'critical-answer',
        title: '先修影响判分的问题',
        desc: '缺答案、空位不匹配、选择题答案异常、连线答案结构异常，都会直接影响孩子答题结果。',
        issueCount: criticalAnswer.length,
        groupCount: uniqueGroupIds(criticalAnswer).length,
        severity: 'critical' as const,
        actionText: '筛选必须修',
        filter: () => setQuickFilter('critical'),
      },
      {
        key: 'legacy-format',
        title: '转换旧公式和旧空位',
        desc: '把 \\(...\\)、\\[...\\]、{_0} 这类旧格式转成新系统稳定支持的格式。',
        issueCount: format.issueCount,
        groupCount: format.groupCount,
        severity: 'warning' as const,
        actionText: '立即转换',
        run: () => void autoNormalizeLegacyFormat(),
        filter: () => setQuickFilter('warning', '格式'),
      },
      {
        key: 'duplicates',
        title: '清理疑似重复题',
        desc: 'OCR 或重复导入后容易产生相同题，建议只保留一个启用版本。',
        issueCount: duplicate.issueCount,
        groupCount: duplicate.groupCount,
        severity: 'warning' as const,
        actionText: '停用重复旧题',
        run: () => void disableDuplicateGroups('newest'),
        filter: () => setQuickFilter('warning', '重复'),
      },
      {
        key: 'repair-queue',
        title: '处理修复队列',
        desc: '已标记为需修复的题目建议逐题进入编辑页处理，避免坏题混入日常练习。',
        issueCount: repair.issueCount,
        groupCount: repair.groupCount,
        severity: 'warning' as const,
        actionText: '编辑第一道',
        run: () => repairGroupIds[0] && onEdit(repairGroupIds[0], repairGroupIds),
        filter: () => setQuickFilter('warning', '修复'),
      },
      {
        key: 'metadata',
        title: '补齐年级和知识点',
        desc: '标签和年级会影响孩子筛题、学习报告和知识点统计。',
        issueCount: metadataIssues.length,
        groupCount: uniqueGroupIds(metadataIssues).length,
        severity: 'info' as const,
        actionText: '一键修复建议',
        run: () => void autoFixSimpleIssues(),
        filter: () => { setSeverity('ALL'); setCategory('ALL'); setKeyword(''); },
      },
      {
        key: 'explanation',
        title: '补充错题解析',
        desc: '解析不会影响判分，但孩子做错后能不能自己看懂，主要靠这一块。',
        issueCount: explanation.issueCount,
        groupCount: explanation.groupCount,
        severity: 'info' as const,
        actionText: '筛选无解析',
        filter: () => setQuickFilter('info', '解析'),
      },
    ].filter((item) => item.issueCount > 0);
  }, [result.issues, repairGroupIds, filteredIssues]);

  const copyAuditSummary = async () => {
    const lines = [
      '# 题库体检摘要',
      '',
      `- 题组：${result.stats.groupCount} 个（启用 ${result.stats.enabledCount} / 停用 ${result.stats.disabledCount}）`,
      `- 小题：${result.stats.questionCount} 道`,
      `- 必须修：${result.stats.criticalCount} 个`,
      `- 建议修：${result.stats.warningCount} 个`,
      `- 可关注：${result.stats.infoCount} 个`,
      `- 解析覆盖率：${result.stats.explanationCoverage}%`,
      '',
      '## 建议处理顺序',
      ...(recommendations.length
        ? recommendations.map((item, index) => `${index + 1}. ${item.title}：${item.issueCount} 个问题，涉及 ${item.groupCount} 个题组。建议动作：${item.actionText}`)
        : ['暂无需要处理的问题。']),
      '',
      '## 问题分布',
      ...(categorySummary.length
        ? categorySummary.map((item) => `- ${item.category}：${item.issues.length} 个问题 / ${item.groups.length} 个题组（必须修 ${item.critical}，建议修 ${item.warning}，可关注 ${item.info}）`)
        : ['暂无问题分布。']),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setMessage('已复制体检摘要，可以直接粘贴到笔记或发给其他 AI 分析。');
  };

  return (
    <div className="question-audit-page animate-fadeIn">
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <button className="btn btn-soft btn-sm" onClick={onBack}>← 返回题库</button>
          <h1 className="page-title">题库体检中心</h1>
          <p className="page-subtitle">集中发现坏题、缺答案、缺解析、疑似重复和旧格式残留。先把题库养健康，后面批量 OCR 导入才稳。</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={onImportJson}>导入题目 JSON</button>
          <button className="btn btn-outline btn-sm" onClick={onOpenImportBatches}>导入批次</button>
          <button className="btn btn-outline btn-sm" onClick={() => void copyAuditSummary()} disabled={!result.issues.length}>复制摘要</button>
          <button className="btn btn-secondary btn-sm" onClick={exportReport} disabled={!result.issues.length}>导出体检报告</button>
          <button className="btn btn-primary btn-sm" onClick={() => void refresh()} disabled={loading}>{loading ? '扫描中...' : '重新扫描'}</button>
        </div>
      </header>

      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}
      {paperId && <div className="message-banner info" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <span>验收试卷已生成：#{paperId}</span>
        <button className="btn btn-soft btn-sm" onClick={() => onOpenPaper(paperId)}>查看试卷</button>
        <button className="btn btn-primary btn-sm" onClick={() => onStartPaper(paperId)}>孩子端验收</button>
      </div>}

      <section className="audit-stat-grid">
        <div className="audit-stat-card"><span>题组</span><b>{result.stats.groupCount}</b><small>启用 {result.stats.enabledCount} / 停用 {result.stats.disabledCount}</small></div>
        <div className="audit-stat-card"><span>小题</span><b>{result.stats.questionCount}</b><small>解析覆盖 {result.stats.explanationCoverage}%</small></div>
        <button className="audit-stat-card danger as-button" onClick={() => setQuickFilter('critical')}><span>必须修</span><b>{result.stats.criticalCount}</b><small>影响答题或判分</small></button>
        <button className="audit-stat-card warning as-button" onClick={() => setQuickFilter('warning')}><span>建议修</span><b>{result.stats.warningCount}</b><small>影响体验或维护</small></button>
        <button className="audit-stat-card as-button" onClick={() => setQuickFilter('info')}><span>可关注</span><b>{result.stats.infoCount}</b><small>用于持续完善</small></button>
      </section>

      <section className="audit-recommend-card">
        <div className="audit-recommend-head">
          <div>
            <span className="badge badge-muted">修复建议报告</span>
            <h2>今天建议按这个顺序处理</h2>
            <p>我把问题按“影响判分 → 影响展示 → 影响长期维护”排了个队，避免你在题库里迷路。</p>
          </div>
          <div className="audit-recommend-head-actions">
            <button className="btn btn-soft btn-sm" onClick={() => void copyAuditSummary()} disabled={!result.issues.length}>复制摘要</button>
            <button className="btn btn-outline btn-sm" onClick={exportReport} disabled={!result.issues.length}>导出报告 JSON</button>
          </div>
        </div>
        {recommendations.length ? (
          <div className="audit-recommend-grid">
            {recommendations.map((item, index) => (
              <article className={`audit-recommend-item ${item.severity}`} key={item.key}>
                <em>{index + 1}</em>
                <div>
                  <b>{item.title}</b>
                  <p>{item.desc}</p>
                  <small>{item.issueCount} 个问题，涉及 {item.groupCount} 个题组</small>
                </div>
                <div className="audit-recommend-actions">
                  <button className="btn btn-soft btn-sm" onClick={item.filter}>查看</button>
                  {item.run && <button className={item.severity === 'critical' ? 'btn btn-danger btn-sm' : item.severity === 'warning' ? 'btn btn-warning btn-sm' : 'btn btn-primary btn-sm'} onClick={item.run}>{item.actionText}</button>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <b>题库状态很好</b>
            <p>暂时没有需要处理的问题。此刻可以安心去喝口水，小题库也有自己的秩序了。</p>
          </div>
        )}
      </section>

      {categorySummary.length > 0 && <section className="audit-category-card">
        <h2>问题分布</h2>
        <div className="audit-category-list">
          {categorySummary.map((item) => (
            <button className="audit-category-row" key={item.category} onClick={() => { setCategory(item.category); setSeverity('ALL'); setKeyword(''); }}>
              <b>{item.category}</b>
              <span>{item.issues.length} 个问题 / {item.groups.length} 个题组</span>
              <i>
                {item.critical > 0 && <em className="danger">必须修 {item.critical}</em>}
                {item.warning > 0 && <em className="warning">建议修 {item.warning}</em>}
                {item.info > 0 && <em>可关注 {item.info}</em>}
              </i>
            </button>
          ))}
        </div>
      </section>}

      <section className="audit-quick-actions">
        <button className="btn btn-soft btn-sm" onClick={() => setQuickFilter('ALL')}>全部问题</button>
        <button className="btn btn-outline btn-sm" onClick={() => setQuickFilter('critical', '答案')}>缺答案/答案异常</button>
        <button className="btn btn-outline btn-sm" onClick={() => setQuickFilter('info', '解析')}>无解析题</button>
        <button className="btn btn-outline btn-sm" onClick={() => setQuickFilter('warning', '标签')}>无标签题</button>
        <button className="btn btn-outline btn-sm" onClick={() => setQuickFilter('warning', '重复')}>疑似重复</button>
        <button className="btn btn-outline btn-sm" onClick={() => setQuickFilter('warning', '格式')}>旧格式残留</button>
        <button className="btn btn-primary btn-sm" onClick={() => setQuickFilter('info', '验收')}>待验收题</button>
        <button className="btn btn-warning btn-sm" onClick={() => setQuickFilter('warning', '修复')}>修复队列</button>
      </section>

      <section className="audit-toolbar">
        <select value={severity} onChange={(event) => setSeverity(event.target.value as any)}>
          <option value="ALL">全部级别</option>
          <option value="critical">必须修</option>
          <option value="warning">建议修</option>
          <option value="info">可关注</option>
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => <option key={item} value={item}>{item === 'ALL' ? '全部问题' : item}</option>)}
        </select>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按题组 ID、问题描述搜索..." />
      </section>

      <section className="audit-bulk-card">
        <div>
          <b>批量处理</b>
          <p>当前筛选涉及 {visibleGroupIds.length} 个题组，已选择 {selectedGroupIds.length} 个题组。待验收 {pendingGroupIds.length} 个，需修复 {repairGroupIds.length} 个，疑似重复 {duplicateGroupIds.length} 个。</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={selectVisibleGroups} disabled={!visibleGroupIds.length}>选择当前筛选题组</button>
        <button className="btn btn-primary btn-sm" onClick={() => void bulkEnable()} disabled={!selectedGroupIds.length}>批量启用</button>
        <button className="btn btn-warning btn-sm" onClick={() => void bulkDisable()} disabled={!selectedGroupIds.length}>批量停用</button>
        <button className="btn btn-outline btn-sm" onClick={() => void createReviewPaper('pending')} disabled={creatingPaper || !pendingGroupIds.length}>{creatingPaper ? '生成中...' : `生成待验收卷(${pendingGroupIds.length})`}</button>
        <button className="btn btn-outline btn-sm" onClick={() => void createReviewPaper('selected')} disabled={creatingPaper || !selectedGroupIds.length}>按已选生成验收卷</button>
        <button className="btn btn-primary btn-sm" onClick={() => void autoFixSimpleIssues()} disabled={!filteredIssues.some((issue) => issue.category === '标签' || issue.category === '年级')}>一键修复建议</button>
        <button className="btn btn-primary btn-sm" onClick={() => void autoNormalizeLegacyFormat()} disabled={!filteredIssues.some((issue) => issue.category === '格式')}>转换旧格式</button>
        <button className="btn btn-warning btn-sm" onClick={() => void disableDuplicateGroups('newest')} disabled={!duplicateGroupIds.length}>停用重复旧题</button>
        <button className="btn btn-outline btn-sm" onClick={() => void disableDuplicateGroups('oldest')} disabled={!duplicateGroupIds.length}>停用重复新题</button>
        <button className="btn btn-secondary btn-sm" onClick={() => void bulkMarkReviewed('pending')} disabled={!pendingGroupIds.length}>全部待验收通过</button>
        <button className="btn btn-secondary btn-sm" onClick={() => void bulkMarkReviewed('selected')} disabled={!selectedGroupIds.length}>已选验收通过</button>
        <button className="btn btn-warning btn-sm" onClick={() => void bulkMarkNeedRepair()} disabled={!selectedGroupIds.length}>标记需修复</button>
        <button className="btn btn-secondary btn-sm" onClick={() => void bulkMarkRepaired('selected')} disabled={!selectedGroupIds.length}>已选修复完成</button>
        <button className="btn btn-secondary btn-sm" onClick={() => void bulkMarkRepaired('repair')} disabled={!repairGroupIds.length}>全部修复完成({repairGroupIds.length})</button>
        <input value={bulkTagsText} onChange={(event) => setBulkTagsText(event.target.value)} placeholder="追加标签，多个用逗号或换行" />
        <button className="btn btn-primary btn-sm" onClick={() => void bulkAddTags()} disabled={!selectedGroupIds.length}>追加标签</button>
        <button className="btn btn-soft btn-sm" onClick={clearSelection} disabled={!selectedGroupIds.length}>清空选择</button>
      </section>

      {repairGroupIds.length > 0 && (
        <section className="audit-repair-card">
          <div>
            <span className="badge badge-warning">修复队列</span>
            <h3>还有 {repairGroupIds.length} 个题组需要修复</h3>
            <p>建议按队列逐个打开，修完后点“已选修复完成”或“全部修复完成”。</p>
          </div>
          <div className="audit-repair-actions">
            <button className="btn btn-primary btn-sm" onClick={() => onEdit(repairGroupIds[0], repairGroupIds)}>编辑第一道需修复题</button>
            <button className="btn btn-outline btn-sm" onClick={() => {
              setQuickFilter('warning', '修复');
              setSelectedGroups(Object.fromEntries(repairGroupIds.map((id) => [id, true])));
            }}>选中全部需修复</button>
          </div>
        </section>
      )}

      <section className="audit-result-card">
        <div className="audit-result-head">
          <h2>问题清单</h2>
          <span>{filteredIssues.length} / {result.issues.length}</span>
        </div>

        {!filteredIssues.length ? (
          <div className="empty-state">
            <b>当前筛选下没有问题</b>
            <p>这块干净得像刚擦过的小黑板。可以切换筛选条件继续检查。</p>
          </div>
        ) : (
          <div className="audit-issue-list">
            {filteredIssues.map((issue) => (
              <article className={`audit-issue-card ${issue.severity}`} key={issue.id}>
                <label className="audit-issue-check">
                  <input checked={Boolean(selectedGroups[issue.groupId])} onChange={(event) => toggleGroup(issue.groupId, event.target.checked)} type="checkbox" />
                </label>
                <div className="audit-issue-main">
                  <div className="audit-issue-title">
                    <span className={`badge badge-${severityClass[issue.severity]}`}>{severityLabel[issue.severity]}</span>
                    <span className="badge badge-muted">{issue.category}</span>
                    <b>{issue.title}</b>
                  </div>
                  <p>{issue.detail}</p>
                  <small>建议：{issue.suggestion}</small>
                </div>
                <div className="audit-issue-actions">
                  <span>题组 #{issue.groupId}{issue.questionId ? ` / 小题 #${issue.questionId}` : ''}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => onEdit(issue.groupId, issue.category === '修复' ? repairGroupIds : undefined)}>编辑题组</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
