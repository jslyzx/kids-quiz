import { FormEvent, useEffect, useState } from 'react';
import { createManagedStudent, deleteManagedStudent, listManagedStudents, updateManagedStudent, updateManagedStudentPin, type ManagedStudent } from '../api/student';
import { notifyStudentsChanged } from '../utils/selectedStudent';
import { useToast } from '../components/ToastProvider';
import { ConfirmDialog } from '../components/Modal';

type Draft = {
  id?: string;
  name: string;
  avatarUrl: string;
  grade: string;
  pin: string;
  status: 'ENABLED' | 'DISABLED';
};

const emptyDraft: Draft = {
  name: '',
  avatarUrl: '',
  grade: '二年级',
  pin: '',
  status: 'ENABLED',
};

function toDraft(student: ManagedStudent): Draft {
  return {
    id: String(student.id),
    name: student.name,
    avatarUrl: student.avatarUrl ?? '',
    grade: student.grade ?? '',
    pin: '',
    status: student.status === 'DISABLED' ? 'DISABLED' : 'ENABLED',
  };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

export function StudentManagementPage() {
  const { toast } = useToast();
  const [students, setStudents] = useState<ManagedStudent[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedStudent | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setStudents(await listManagedStudents());
      notifyStudentsChanged();
    } catch (error) {
      toast.danger(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      if (draft.id) {
        await updateManagedStudent(draft.id, {
          name: draft.name,
          avatarUrl: draft.avatarUrl,
          grade: draft.grade,
          status: draft.status,
        });
        if (draft.pin.trim()) await updateManagedStudentPin(draft.id, draft.pin);
        toast.success('学生信息已更新');
      } else {
        await createManagedStudent({
          name: draft.name,
          avatarUrl: draft.avatarUrl,
          grade: draft.grade,
          pin: draft.pin,
        });
        toast.success('学生已新增');
      }
      setDraft(emptyDraft);
      await refresh();
    } catch (error) {
      toast.danger(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function clearPin(student: ManagedStudent) {
    setSaving(true);
    try {
      await updateManagedStudentPin(String(student.id), '');
      toast.success(`${student.name} 的 PIN 已清除`);
      await refresh();
    } catch (error) {
      toast.danger(`清除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteStudent() {
    if (!deleteTarget) return;
    const student = deleteTarget;
    setSaving(true);
    try {
      await deleteManagedStudent(String(student.id));
      toast.success('学生已删除');
      await refresh();
      if (draft.id && String(draft.id) === String(student.id)) setDraft(emptyDraft);
    } catch (error) {
      toast.danger(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="studentManagePage animate-fadeIn">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">学生管理</h1>
          <p className="page-subtitle">维护孩子端登录档案、年级、头像和 PIN。</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-soft btn-sm" onClick={refresh} disabled={loading}>{loading ? '刷新中...' : '刷新'}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setDraft(emptyDraft)}>新增学生</button>
        </div>
      </header>

      <div className="studentManageGrid">
        <section className="card studentManageForm">
          <h2 className="card-title">{draft.id ? '编辑学生' : '新增学生'}</h2>
          <form onSubmit={submit}>
            <label>
              姓名
              <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="比如：小宇" />
            </label>
            <label>
              年级
              <input value={draft.grade} onChange={(event) => setDraft((prev) => ({ ...prev, grade: event.target.value }))} placeholder="比如：二年级" />
            </label>
            <label>
              头像 URL
              <input value={draft.avatarUrl} onChange={(event) => setDraft((prev) => ({ ...prev, avatarUrl: event.target.value }))} placeholder="可选" />
            </label>
            {draft.id && (
              <label>
                状态
                <select value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as Draft['status'] }))}>
                  <option value="ENABLED">启用</option>
                  <option value="DISABLED">停用</option>
                </select>
              </label>
            )}
            <label>
              {draft.id ? '新 PIN' : 'PIN'}
              <input value={draft.pin} onChange={(event) => setDraft((prev) => ({ ...prev, pin: event.target.value }))} type="password" inputMode="numeric" placeholder={draft.id ? '留空则不修改' : '可选'} />
            </label>
            <div className="page-actions">
              <button className="btn btn-primary" disabled={saving || !draft.name.trim()}>{saving ? '保存中...' : '保存'}</button>
              <button className="btn btn-ghost" type="button" onClick={() => setDraft(emptyDraft)}>取消</button>
            </div>
          </form>
        </section>

        <section className="studentManageList">
          {students.map((student) => (
            <article className="card studentManageCard" key={student.id}>
              <div className="studentManageAvatar">
                {student.avatarUrl ? <img src={student.avatarUrl} alt={student.name} /> : student.name.slice(0, 1)}
              </div>
              <div className="studentManageInfo">
                <div className="studentManageTitle">
                  <h2>{student.name}</h2>
                  <span className={`badge ${student.status === 'ENABLED' ? 'badge-success' : 'badge-warning'}`}>
                    {student.status === 'ENABLED' ? '启用' : '停用'}
                  </span>
                </div>
                <p>{student.grade || '未设置年级'} / {student.pinEnabled ? '已设置 PIN' : '免 PIN'}</p>
                <div className="studentManageStats">
                  <span>星星 {student.totalStars ?? 0}</span>
                  <span>连续 {student.streakDays ?? 0} 天</span>
                  <span>最近 {formatDate(student.lastPracticeDate)}</span>
                </div>
              </div>
              <div className="studentManageActions">
                <button className="btn btn-soft btn-sm" onClick={() => setDraft(toDraft(student))}>编辑</button>
                {student.pinEnabled && <button className="btn btn-secondary btn-sm" onClick={() => clearPin(student)} disabled={saving}>清除 PIN</button>}
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(student)} disabled={saving}>删除</button>
              </div>
            </article>
          ))}
          {!students.length && !loading && <div className="empty-state"><p className="empty-state-title">还没有学生档案</p></div>}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除学生"
        danger
        confirmText="删除"
        confirmByText={deleteTarget?.name}
        description={deleteTarget ? `确认删除学生「${deleteTarget.name}」？为防止误删，请在下方输入学生姓名确认。历史练习记录会保留，但该学生将不再显示。` : ''}
        onConfirm={confirmDeleteStudent}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
