import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listLoginStudents, loginStudent, type LoginStudent } from '../api/student';

export function StudentLoginPage() {
  const [ownerUsername, setOwnerUsername] = useState('admin');
  const [students, setStudents] = useState<LoginStudent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const selected = students.find((student) => String(student.id) === String(selectedId));

  async function loadStudents(nextOwner = ownerUsername) {
    setMessage('');
    setLoading(true);
    try {
      const rows = await listLoginStudents(nextOwner);
      setStudents(rows);
      setSelectedId(String(rows[0]?.id ?? ''));
      setPin('');
    } catch (error) {
      setStudents([]);
      setSelectedId('');
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStudents('admin');
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setMessage('');
    setSubmitting(true);
    try {
      await loginStudent({ ownerUsername, studentId: selectedId, pin });
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="loginPage">
      <form className="loginPanel studentLoginPanel" onSubmit={submit}>
        <div className="loginBrand">
          <span>Kids Quiz</span>
          <b>孩子登录</b>
        </div>

        <label>
          家庭账号
          <div className="studentLoginOwner">
            <input value={ownerUsername} onChange={(event) => setOwnerUsername(event.target.value)} autoComplete="username" />
            <button className="btn" type="button" disabled={loading || !ownerUsername.trim()} onClick={() => loadStudents()}>
              {loading ? '加载中...' : '刷新'}
            </button>
          </div>
        </label>

        <div className="studentLoginList">
          {students.map((student) => (
            <button
              className={`studentLoginCard ${String(student.id) === String(selectedId) ? 'selected' : ''}`}
              key={student.id}
              type="button"
              onClick={() => {
                setSelectedId(String(student.id));
                setPin('');
              }}
            >
              <span className="studentLoginAvatar">{student.avatarUrl ? <img src={student.avatarUrl} alt={student.name} /> : student.name.slice(0, 1)}</span>
              <span>
                <b>{student.name}</b>
                <small>{[student.grade, student.pinEnabled ? '需要 PIN' : '免 PIN'].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
          ))}
          {!loading && !students.length && <p className="loginEmpty">没有可登录的学生</p>}
        </div>

        {selected?.pinEnabled && (
          <label>
            PIN
            <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" autoFocus />
          </label>
        )}

        {message && <p className="loginError">{message}</p>}
        <button className="btn btn-primary" disabled={submitting || !selectedId || Boolean(selected?.pinEnabled && !pin)}>
          {submitting ? '进入中...' : '进入孩子端'}
        </button>
      </form>
    </main>
  );
}
