import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAdminSession, clearStudentSession, getAdminUser } from '../api/client';
import { createStudentSessionFromAdmin, listManagedStudents, type ManagedStudent } from '../api/student';
import { getSelectedStudentId, setSelectedStudentId, subscribeStudentsChange } from '../utils/selectedStudent';
import { Breadcrumb } from '../components/Breadcrumb';

const NAV_ITEMS = [
  { label: '管理', section: true },
  { to: '/parent', icon: '📊', label: '仪表盘' },
  { to: '/parent/questions', icon: '📚', label: '题库管理' },
  { to: '/parent/questions/import-batches', icon: '🧾', label: '导入批次' },
  { to: '/parent/questions/audit', icon: '🩺', label: '题库体检' },
  { to: '/parent/papers', icon: '📝', label: '试卷管理' },
  { label: '教学', section: true },
  { to: '/parent/students', icon: '👧', label: '学生管理' },
  { to: '/parent/tasks', icon: '📌', label: '任务设置' },
  { to: '/parent/report', icon: '📈', label: '学习报告' },
  { to: '/parent/records', icon: '⏱️', label: '练习记录' },
  { to: '/parent/wrong', icon: '❌', label: '错题本' },
  { to: '/parent/rewards', icon: '⭐', label: '奖励中心' },
];

// 路径 → 面包屑映射（用于自动生成）
function buildBreadcrumb(pathname: string): { label: string; to?: string }[] {
  const crumbs: { label: string; to?: string }[] = [{ label: '家长中心', to: '/parent' }];
  if (pathname === '/parent') return crumbs;
  // 匹配最长前缀的导航项
  const match = NAV_ITEMS.filter((item) => !item.section && pathname.startsWith(item.to!))
    .sort((a, b) => b.to!.length - a.to!.length)[0];
  if (match) crumbs.push({ label: match.label!, to: match.to });
  // 子页（edit/:id, import-batches/:id, papers/edit/:id 等）
  if (/\/questions\/edit\//.test(pathname)) crumbs.push({ label: '编辑题目' });
  else if (/\/questions\/import-batches\//.test(pathname)) crumbs.push({ label: '批次详情' });
  else if (/\/questions\/import-json/.test(pathname)) crumbs.push({ label: '导入 JSON' });
  else if (/\/questions\/batch-fill/.test(pathname)) crumbs.push({ label: '批量填空' });
  else if (/\/papers\/edit\//.test(pathname)) crumbs.push({ label: '编辑试卷' });
  else if (/\/papers\/preview\//.test(pathname)) crumbs.push({ label: '预览试卷' });
  else if (/\/papers\/print\//.test(pathname)) crumbs.push({ label: '打印试卷' });
  else if (/\/papers\/records\//.test(pathname)) crumbs.push({ label: '练习记录' });
  return crumbs;
}

export function ParentLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // PC 桌面端侧栏折叠状态，持久化到 localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('kidsQuiz.sidebarCollapsed') === '1'; } catch { return false; }
  });
  const [students, setStudents] = useState<ManagedStudent[]>([]);
  const [selectedStudentId, setSelectedStudentIdState] = useState(getSelectedStudentId);
  const [studentLoadState, setStudentLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const navigate = useNavigate();
  const location = useLocation();
  const breadcrumbItems = buildBreadcrumb(location.pathname);
  const user = getAdminUser();

  const toggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('kidsQuiz.sidebarCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  function loadStudents() {
    setStudentLoadState('loading');
    listManagedStudents().then((rows) => {
      setStudents(rows);
      const current = getSelectedStudentId();
      const next = rows.some((student) => String(student.id) === String(current))
        ? current
        : String(rows[0]?.id ?? '');
      setSelectedStudentIdState(next);
      setSelectedStudentId(next);
      if (next) void createStudentSessionFromAdmin(next).catch(() => undefined);
      setStudentLoadState('idle');
    }).catch(() => setStudentLoadState('error'));
  }

  useEffect(() => {
    loadStudents();
    const unsubscribe = subscribeStudentsChange(() => { loadStudents(); });
    return unsubscribe;
  }, []);

  function changeStudent(studentId: string) {
    setSelectedStudentIdState(studentId);
    setSelectedStudentId(studentId);
    void createStudentSessionFromAdmin(studentId).catch(() => undefined);
  }

  async function switchToKidHome() {
    await createStudentSessionFromAdmin(selectedStudentId || undefined).catch(() => undefined);
    navigate('/');
  }

  function logout() {
    clearAdminSession();
    clearStudentSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`parent-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
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
                title={item.label}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span className="sidebar-link-text">{item.label}</span>
              </NavLink>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-link" title="切换到孩子端" onClick={() => { setSidebarOpen(false); void switchToKidHome(); }}>
            <span className="sidebar-link-icon">👦</span>
            <span className="sidebar-link-text">切换到孩子端</span>
          </button>
        </div>
      </aside>

      <div className="parent-main">
        <header className="parent-topbar">
          <div className="parent-topbar-left">
            <button className="sidebar-toggle mobile-only" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="打开菜单">☰</button>
            <button className="sidebar-toggle desktop-only" onClick={toggleCollapse} aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'} title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}>
              {sidebarCollapsed ? '☰' : '◂'}
            </button>
          </div>
          <div className="parent-topbar-right">
            {!!students.length && (
              <select className="studentSelect" value={selectedStudentId} onChange={(event) => changeStudent(event.target.value)} title="当前查看学生">
                {students.map((student) => <option key={student.id} value={String(student.id)}>{student.name}</option>)}
              </select>
            )}
            {studentLoadState === 'loading' && <span className="adminUserName">同步学生...</span>}
            {studentLoadState === 'error' && <span className="adminUserName">学生加载失败</span>}
            <span className="adminUserName">{user?.displayName || user?.username || '管理员'}</span>
            <button className="btn btn-soft btn-sm" onClick={switchToKidHome}>孩子首页</button>
            <button className="btn btn-secondary btn-sm" onClick={logout}>退出</button>
          </div>
        </header>
        <div className="parent-content">
          <Breadcrumb items={breadcrumbItems} />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
