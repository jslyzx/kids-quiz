import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ParentLayout } from './layouts/ParentLayout';
import { ApiStatusBanner } from './components/ApiStatusBanner';
import { clearStudentSession, isAdminLoggedIn, isStudentLoggedIn } from './api/client';
import './index.css';

const QuestionEditorPage = lazy(() => import('./pages/QuestionEditorPage').then((module) => ({ default: module.QuestionEditorPage })));
const QuestionListPage = lazy(() => import('./pages/QuestionListPage').then((module) => ({ default: module.QuestionListPage })));
const QuestionAuditPage = lazy(() => import('./pages/QuestionAuditPage').then((module) => ({ default: module.QuestionAuditPage })));
const ImportBatchListPage = lazy(() => import('./pages/ImportBatchListPage').then((module) => ({ default: module.ImportBatchListPage })));
const ImportBatchDetailPage = lazy(() => import('./pages/ImportBatchDetailPage').then((module) => ({ default: module.ImportBatchDetailPage })));
const BatchFillBlankPage = lazy(() => import('./pages/BatchFillBlankPage').then((module) => ({ default: module.BatchFillBlankPage })));
const QuestionJsonImportPage = lazy(() => import('./pages/QuestionJsonImportPage').then((module) => ({ default: module.QuestionJsonImportPage })));
const PaperListPage = lazy(() => import('./pages/PaperListPage').then((module) => ({ default: module.PaperListPage })));
const PaperEditorPage = lazy(() => import('./pages/PaperEditorPage').then((module) => ({ default: module.PaperEditorPage })));
const PaperPreviewPage = lazy(() => import('./pages/PaperPreviewPage').then((module) => ({ default: module.PaperPreviewPage })));
const PaperPrintPage = lazy(() => import('./pages/PaperPrintPage').then((module) => ({ default: module.PaperPrintPage })));
const PracticeRecordsPage = lazy(() => import('./pages/PracticeRecordsPage').then((module) => ({ default: module.PracticeRecordsPage })));
const WrongBookPage = lazy(() => import('./pages/WrongBookPage').then((module) => ({ default: module.WrongBookPage })));
const KidHomePage = lazy(() => import('./pages/KidHomePage').then((module) => ({ default: module.KidHomePage })));
const WrongRetryPage = lazy(() => import('./pages/WrongRetryPage').then((module) => ({ default: module.WrongRetryPage })));
const WrongPrintPage = lazy(() => import('./pages/WrongPrintPage').then((module) => ({ default: module.WrongPrintPage })));
const TaskCenterPage = lazy(() => import('./pages/TaskCenterPage').then((module) => ({ default: module.TaskCenterPage })));
const TaskSettingsPage = lazy(() => import('./pages/TaskSettingsPage').then((module) => ({ default: module.TaskSettingsPage })));
const StudyReportPage = lazy(() => import('./pages/StudyReportPage').then((module) => ({ default: module.StudyReportPage })));
const RewardCenterPage = lazy(() => import('./pages/RewardCenterPage').then((module) => ({ default: module.RewardCenterPage })));
const ParentDashboardPage = lazy(() => import('./pages/ParentDashboardPage').then((module) => ({ default: module.ParentDashboardPage })));
const StudentPracticePlayerPage = lazy(() => import('./pages/StudentPracticePlayerPage').then((module) => ({ default: module.StudentPracticePlayerPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const StudentLoginPage = lazy(() => import('./pages/StudentLoginPage').then((module) => ({ default: module.StudentLoginPage })));
const StudentManagementPage = lazy(() => import('./pages/StudentManagementPage').then((module) => ({ default: module.StudentManagementPage })));
const EntertainmentCenterPage = lazy(() => import('./pages/EntertainmentCenterPage').then((module) => ({ default: module.EntertainmentCenterPage })));

/* ---- 路由适配包装器 ---- */
/* 将 react-router 的导航方法转换为现有页面组件期望的回调 props */

function KidHomeRoute() {
  const navigate = useNavigate();
  return <KidHomePage
    onBackAdmin={() => navigate('/parent')}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onOpenWrongBook={() => navigate('/kid/wrong')}
    onRetryWrong={() => navigate('/kid/wrong-retry')}
    onOpenTaskCenter={() => navigate('/kid/tasks')}
    onOpenReport={() => navigate('/kid/report')}
    onOpenRewards={() => navigate('/kid/rewards')}
    onOpenRecords={() => navigate('/kid/records')}
    onOpenGames={() => navigate('/kid/games')}
    onStartQuestionGroup={(groupId) => navigate(`/kid/practice/group/${groupId}`)}
    onSwitchStudent={() => {
      clearStudentSession();
      navigate('/student-login', { replace: true });
    }}
  />;
}

function StudentPracticeRoute() {
  const { paperId } = useParams();
  const navigate = useNavigate();
  return <StudentPracticePlayerPage
    paperId={paperId}
    onHome={() => navigate('/')}
    onRetryWrong={() => navigate('/kid/wrong-retry')}
  />;
}

function QuestionPracticeRoute() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  return <StudentPracticePlayerPage
    questionGroupId={groupId}
    onHome={() => navigate('/')}
    onContinueQuestionGroup={(id) => navigate(`/kid/practice/group/${id}`)}
    onRetryWrong={() => navigate('/kid/wrong-retry')}
  />;
}

function ParentDashboardRoute() {
  const navigate = useNavigate();
  return <ParentDashboardPage
    onKidHome={() => navigate('/')}
    onQuestions={() => navigate('/parent/questions')}
    onPapers={() => navigate('/parent/papers')}
    onTaskSettings={() => navigate('/parent/tasks')}
    onTaskCenter={() => navigate('/kid/tasks')}
    onReport={() => navigate('/parent/report')}
    onWrongBook={() => navigate('/parent/wrong')}
    onRewards={() => navigate('/parent/rewards')}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onOpenRecords={() => navigate('/parent/records')}
  />;
}

function QuestionListRoute() {
  const navigate = useNavigate();
  return <QuestionListPage
    onCreate={() => navigate('/parent/questions/new')}
    onEdit={(id) => navigate(`/parent/questions/edit/${id}`)}
    onOpenPapers={() => navigate('/parent/papers')}
    onOpenWrongBook={() => navigate('/parent/wrong')}
    onOpenKidHome={() => navigate('/')}
    onOpenTaskSettings={() => navigate('/parent/tasks')}
    onBatchFillBlank={() => navigate('/parent/questions/batch-fill')}
    onImportJson={() => navigate('/parent/questions/import-json')}
    onOpenImportBatches={() => navigate('/parent/questions/import-batches')}
  />;
}

function BatchFillBlankRoute() {
  const navigate = useNavigate();
  return <BatchFillBlankPage onBack={() => navigate('/parent/questions')} />;
}

function QuestionJsonImportRoute() {
  const navigate = useNavigate();
  return <QuestionJsonImportPage
    onBack={() => navigate('/parent/questions')}
    onOpenPaper={(paperId) => navigate(`/parent/papers/preview/${paperId}`)}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onOpenAudit={() => navigate('/parent/questions/audit')}
    onOpenImportBatches={() => navigate('/parent/questions/import-batches')}
  />;
}

function QuestionAuditRoute() {
  const navigate = useNavigate();
  return <QuestionAuditPage
    onBack={() => navigate('/parent/questions')}
    onEdit={(id, repairQueue) => navigate(`/parent/questions/edit/${id}${repairQueue?.length ? `?repairQueue=${encodeURIComponent(repairQueue.join(','))}` : ''}`)}
    onImportJson={() => navigate('/parent/questions/import-json')}
    onOpenImportBatches={() => navigate('/parent/questions/import-batches')}
    onOpenPaper={(paperId) => navigate(`/parent/papers/preview/${paperId}`)}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
  />;
}

function ImportBatchListRoute() {
  const navigate = useNavigate();
  return <ImportBatchListPage
    onBack={() => navigate('/parent/questions')}
    onImportJson={() => navigate('/parent/questions/import-json')}
    onOpenAudit={() => navigate('/parent/questions/audit')}
    onOpenPaper={(paperId) => navigate(`/parent/papers/preview/${paperId}`)}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onOpenBatch={(batchId) => navigate(`/parent/questions/import-batches/${batchId}`)}
  />;
}

function ImportBatchDetailRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <ImportBatchDetailPage
    batchId={id!}
    onBack={() => navigate('/parent/questions/import-batches')}
    onOpenAudit={() => navigate('/parent/questions/audit')}
    onOpenPaper={(paperId) => navigate(`/parent/papers/preview/${paperId}`)}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onEditQuestion={(groupId) => navigate(`/parent/questions/edit/${groupId}`)}
  />;
}

function QuestionEditorRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <QuestionEditorPage
    initialEditGroupId={id || null}
    isNew={!id}
    onBack={() => navigate('/parent/questions')}
    onOpenPapers={() => navigate('/parent/papers')}
  />;
}

function PaperListRoute() {
  const navigate = useNavigate();
  return <PaperListPage
    onBackQuestions={() => navigate('/parent/questions')}
    onEditPaper={(id) => navigate(`/parent/papers/edit/${id}`)}
    onPreviewPaper={(id) => navigate(`/parent/papers/preview/${id}`)}
    onPrintPaper={(id) => navigate(`/parent/papers/print/${id}`)}
    onOpenRecords={(id) => navigate(`/parent/papers/records/${id}`)}
  />;
}

function PaperEditorRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <PaperEditorPage
    paperId={id!}
    onBack={() => navigate('/parent/papers')}
    onPreview={() => navigate(`/parent/papers/preview/${id}`)}
  />;
}

function PaperPreviewRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <PaperPreviewPage
    paperId={id!}
    onBack={() => navigate('/parent/papers')}
    onEdit={() => navigate(`/parent/papers/edit/${id}`)}
    onHome={() => navigate('/')}
    onRetryWrong={() => navigate('/kid/wrong-retry')}
    onTaskCenter={() => navigate('/kid/tasks')}
  />;
}

function PaperPrintRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <PaperPrintPage
    paperId={id!}
    onBack={() => navigate('/parent/papers')}
    onPreview={() => navigate(`/parent/papers/preview/${id}`)}
  />;
}

function PaperRecordsRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <PracticeRecordsPage
    paperId={id!}
    onBack={() => navigate('/parent/papers')}
    onPreview={() => navigate(`/parent/papers/preview/${id}`)}
  />;
}

function AllRecordsRoute() {
  const navigate = useNavigate();
  return <PracticeRecordsPage
    onBack={() => navigate(-1 as any)}
  />;
}

function TaskSettingsRoute() {
  const navigate = useNavigate();
  return <TaskSettingsPage
    onBack={() => navigate('/parent/questions')}
    onOpenTaskCenter={() => navigate('/kid/tasks')}
  />;
}

function TaskCenterRoute() {
  const navigate = useNavigate();
  return <TaskCenterPage
    onHome={() => navigate('/')}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onRetryWrong={() => navigate('/kid/wrong-retry')}
    onRetryTag={(tag) => navigate('/kid/wrong-retry', { state: { tag } })}
    onOpenWrongBook={() => navigate('/kid/wrong')}
  />;
}

function StudyReportRoute() {
  const navigate = useNavigate();
  return <StudyReportPage
    onBack={() => navigate(-1 as any)}
    onTaskCenter={() => navigate('/kid/tasks')}
    onWrongBook={() => navigate('/kid/wrong')}
    onStartPaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onOpenRecords={() => navigate('/kid/records')}
  />;
}

function RewardCenterRoute() {
  const navigate = useNavigate();
  return <RewardCenterPage
    onBack={() => navigate(-1 as any)}
    onTaskCenter={() => navigate('/kid/tasks')}
  />;
}

function EntertainmentCenterRoute() {
  const navigate = useNavigate();
  return <EntertainmentCenterPage onBack={() => navigate('/')} />;
}

function WrongBookRoute() {
  const navigate = useNavigate();
  return <WrongBookPage
    onBack={() => navigate(-1 as any)}
    onOpenPaperRecords={(paperId) => navigate(`/parent/papers/records/${paperId}`)}
    onPracticePaper={(paperId) => navigate(`/kid/practice/paper/${paperId}`)}
    onRetryWrong={() => navigate('/kid/wrong-retry')}
    onRetryTag={(tag) => navigate('/kid/wrong-retry', { state: { tag } })}
    onPrintWrong={() => navigate('/kid/wrong-print')}
  />;
}

function WrongRetryRoute() {
  const navigate = useNavigate();
  return <WrongRetryPage
    onBack={() => navigate('/kid/wrong')}
    onHome={() => navigate('/')}
  />;
}

function WrongPrintRoute() {
  const navigate = useNavigate();
  return <WrongPrintPage
    onBack={() => navigate('/kid/wrong')}
    onRetryWrong={() => navigate('/kid/wrong-retry')}
  />;
}

function RouteFallback() {
  return <div className="routeFallback">加载中...</div>;
}

function AppRoutes() {
  const location = useLocation();
  const loggedIn = isAdminLoggedIn();
  const studentLoggedIn = isStudentLoggedIn();
  const isChildPath = location.pathname === '/' || location.pathname.startsWith('/kid');

  if (!loggedIn && location.pathname.startsWith('/parent')) return <Navigate to="/login" replace />;
  if (loggedIn && location.pathname === '/login') return <Navigate to="/parent" replace />;
  if (!studentLoggedIn && isChildPath) return <Navigate to="/student-login" replace />;
  if (studentLoggedIn && location.pathname === '/student-login') return <Navigate to="/" replace />;

  return (
    <>
      <ApiStatusBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/student-login" element={<StudentLoginPage />} />

        {/* 孩子端路由 */}
        <Route path="/" element={<KidHomeRoute />} />
        <Route path="/kid/practice/paper/:paperId" element={<StudentPracticeRoute />} />
        <Route path="/kid/practice/group/:groupId" element={<QuestionPracticeRoute />} />
        <Route path="/kid/tasks" element={<TaskCenterRoute />} />
        <Route path="/kid/report" element={<StudyReportRoute />} />
        <Route path="/kid/rewards" element={<RewardCenterRoute />} />
        <Route path="/kid/games" element={<EntertainmentCenterRoute />} />
        <Route path="/kid/records" element={<AllRecordsRoute />} />
        <Route path="/kid/wrong" element={<WrongBookRoute />} />
        <Route path="/kid/wrong-retry" element={<WrongRetryRoute />} />
        <Route path="/kid/wrong-print" element={<WrongPrintRoute />} />

        {/* 家长端路由 */}
        <Route path="/parent" element={<ParentLayout />}>
          <Route index element={<ParentDashboardRoute />} />
          <Route path="questions" element={<QuestionListRoute />} />
          <Route path="questions/new" element={<QuestionEditorRoute />} />
          <Route path="questions/batch-fill" element={<BatchFillBlankRoute />} />
          <Route path="questions/import-json" element={<QuestionJsonImportRoute />} />
          <Route path="questions/import-batches" element={<ImportBatchListRoute />} />
          <Route path="questions/import-batches/:id" element={<ImportBatchDetailRoute />} />
          <Route path="questions/audit" element={<QuestionAuditRoute />} />
          <Route path="questions/edit/:id" element={<QuestionEditorRoute />} />
          <Route path="papers" element={<PaperListRoute />} />
          <Route path="papers/edit/:id" element={<PaperEditorRoute />} />
          <Route path="papers/preview/:id" element={<PaperPreviewRoute />} />
          <Route path="papers/print/:id" element={<PaperPrintRoute />} />
          <Route path="papers/records/:id" element={<PaperRecordsRoute />} />
          <Route path="students" element={<StudentManagementPage />} />
          <Route path="tasks" element={<TaskSettingsRoute />} />
          <Route path="report" element={<StudyReportRoute />} />
          <Route path="records" element={<AllRecordsRoute />} />
          <Route path="wrong" element={<WrongBookRoute />} />
          <Route path="rewards" element={<RewardCenterRoute />} />
        </Route>

        {/* 兜底重定向 */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
