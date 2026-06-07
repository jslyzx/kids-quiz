import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../api/auth';

export function LoginPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      await loginAdmin(username, password);
      navigate('/parent', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="loginPage">
      <form className="loginPanel" onSubmit={submit}>
        <div className="loginBrand">
          <span>Kids Quiz</span>
          <b>家长登录</b>
        </div>
        <label>
          用户名
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" autoFocus />
        </label>
        {message && <p className="loginError">{message}</p>}
        <button className="btn btn-primary" disabled={submitting || !username || !password}>
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}
