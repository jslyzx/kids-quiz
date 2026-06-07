import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAdminSession, getAdminUser } from '../api/client';

const NAV_ITEMS = [
  { label: '管理', section: true },
  { to: '/parent', icon: '📊', label: '仪表盘' },
  { to: '/parent/questions', icon: '📚', label: '题库管理' },
  { to: '/parent/questions/audit', icon: '🩺', label: '题库体检' },
  { to: '/parent/papers', icon: '📝', label: '试卷管理' },
  { label: '教学', section: true },
  { to: '/parent/tasks', icon: '📌', label: '任务设置' },
  { to: '/parent/report', icon: '📈', label: '学习报告' },
  { to: '/parent/records', icon: '⏱️', label: '练习记录' },
  { to: '/parent/wrong', icon: '❌', label: '错题本' },
  { to: '/parent/rewards', icon: '⭐', label: '奖励中心' },
];

export function ParentLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const user = getAdminUser();

  function logout() {
    clearAdminSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="parent-layout">
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`parent-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🎯</div>
          <span className="sidebar-brand-text">Kids Quiz</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item, index) =>
            item.section ? (
              <div className="sidebar-section-label" key={index}>{item.label}</div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to!}
                end={item.to === '/parent'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={() => { setSidebarOpen(false); navigate('/'); }}>
            <span className="sidebar-link-icon">👦</span>
            切换到孩子端
          </button>
        </div>
      </aside>

      <div className="parent-main">
        <header className="parent-topbar">
          <div className="parent-topbar-left">
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          </div>
          <div className="parent-topbar-right">
            <span className="adminUserName">{user?.displayName || user?.username || '管理员'}</span>
            <button className="btn btn-soft btn-sm" onClick={() => navigate('/')}>孩子首页</button>
            <button className="btn btn-secondary btn-sm" onClick={logout}>退出</button>
          </div>
        </header>
        <div className="parent-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
