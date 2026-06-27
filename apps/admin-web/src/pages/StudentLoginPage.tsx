import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listLoginStudents, loginStudent, type LoginStudent } from '../api/student';

const PIN_LENGTH = 4;

export function StudentLoginPage() {
  const [ownerUsername, setOwnerUsername] = useState('admin');
  const [students, setStudents] = useState<LoginStudent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pinDigits, setPinDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const pinRefs = useRef<Array<HTMLInputElement | null>>([]);

  const selected = students.find((student) => String(student.id) === String(selectedId));
  const pin = pinDigits.join('');

  async function loadStudents(nextOwner = ownerUsername) {
    setMessage('');
    setLoading(true);
    try {
      const rows = await listLoginStudents(nextOwner);
      setStudents(rows);
      setSelectedId(String(rows[0]?.id ?? ''));
      setPinDigits(Array(PIN_LENGTH).fill(''));
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

  // 选中需要 PIN 的学生时，自动聚焦第一个 PIN 格
  useEffect(() => {
    if (selected?.pinEnabled) {
      setPinDigits(Array(PIN_LENGTH).fill(''));
      const t = window.setTimeout(() => pinRefs.current[0]?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [selectedId, selected?.pinEnabled]);

  const setPinAt = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1); // 只取一个数字
    const next = [...pinDigits];
    next[index] = digit;
    setPinDigits(next);
    setMessage('');
    // 自动跳到下一格
    if (digit && index < PIN_LENGTH - 1) {
      pinRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !pinDigits[index] && index > 0) {
      // 当前格为空时按退格，回到上一格
      pinRefs.current[index - 1]?.focus();
      const next = [...pinDigits];
      next[index - 1] = '';
      setPinDigits(next);
    }
  };

  const handlePinPaste = (event: React.ClipboardEvent) => {
    const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (!text) return;
    event.preventDefault();
    const next = Array(PIN_LENGTH).fill('');
    for (let i = 0; i < text.length; i += 1) next[i] = text[i];
    setPinDigits(next);
    const focusIndex = Math.min(text.length, PIN_LENGTH - 1);
    pinRefs.current[focusIndex]?.focus();
  };

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedId) return;
    setMessage('');
    setSubmitting(true);
    try {
      await loginStudent({ ownerUsername, studentId: selectedId, pin });
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      // 失败后清空 PIN 并聚焦首格
      setPinDigits(Array(PIN_LENGTH).fill(''));
      pinRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  // PIN 输满自动提交
  useEffect(() => {
    if (selected?.pinEnabled && pinDigits.every((d) => d) && pinDigits.length === PIN_LENGTH && !submitting) {
      void submit();
    }
  }, [pinDigits, selected?.pinEnabled, submitting]);

  return (
    <main className="loginPage">
      <form className="loginPanel studentLoginPanel" onSubmit={submit}>
        <div className="loginBrand">
          <span>Kids Quiz</span>
          <b>孩子登录</b>
          <small>选择自己的头像，进入今天的练习</small>
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
                setPinDigits(Array(PIN_LENGTH).fill(''));
              }}
            >
              <span className="studentLoginAvatar">{student.avatarUrl ? <img src={student.avatarUrl} alt={student.name} /> : student.name.slice(0, 1)}</span>
              <span>
                <b>{student.name}</b>
                <small>{[student.grade, student.pinEnabled ? '需要 PIN' : '免 PIN'].filter(Boolean).join(' · ')}</small>
              </span>
              {String(student.id) === String(selectedId) && <em>已选择</em>}
            </button>
          ))}
          {!loading && !students.length && <p className="loginEmpty">没有可登录的学生</p>}
        </div>

        {selected?.pinEnabled && (
          <div className="studentPinField">
            <label>PIN（{PIN_LENGTH} 位数字）</label>
            <div className="studentPinDigits" onPaste={handlePinPaste}>
              {pinDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { pinRefs.current[index] = el; }}
                  className="studentPinDigit"
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  autoComplete="one-time-code"
                  value={digit}
                  onChange={(event) => setPinAt(index, event.target.value)}
                  onKeyDown={(event) => handlePinKeyDown(index, event)}
                  aria-label={`PIN 第 ${index + 1} 位`}
                />
              ))}
            </div>
            <small>请输入家长设置的 {PIN_LENGTH} 位数字 PIN</small>
          </div>
        )}

        {message && <p className="loginError">{message}</p>}
        <button className="btn btn-primary" disabled={submitting || !selectedId || Boolean(selected?.pinEnabled && pin.length < PIN_LENGTH)}>
          {submitting ? '进入中...' : '进入孩子端'}
        </button>
      </form>
    </main>
  );
}
