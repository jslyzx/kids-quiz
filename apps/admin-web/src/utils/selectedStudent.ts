const SELECTED_STUDENT_KEY = 'kidsQuiz.parentSelectedStudentId';
const EVENT_NAME = 'kidsQuiz:selectedStudentChanged';
const STUDENTS_EVENT_NAME = 'kidsQuiz:studentsChanged';

export function getSelectedStudentId() {
  return localStorage.getItem(SELECTED_STUDENT_KEY) || '';
}

export function setSelectedStudentId(studentId: string) {
  if (studentId) localStorage.setItem(SELECTED_STUDENT_KEY, studentId);
  else localStorage.removeItem(SELECTED_STUDENT_KEY);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: studentId }));
}

export function subscribeSelectedStudentChange(listener: () => void) {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}

export function notifyStudentsChanged() {
  window.dispatchEvent(new Event(STUDENTS_EVENT_NAME));
}

export function subscribeStudentsChange(listener: () => void) {
  window.addEventListener(STUDENTS_EVENT_NAME, listener);
  return () => window.removeEventListener(STUDENTS_EVENT_NAME, listener);
}

export function withSelectedStudent(path: string, explicitStudentId?: string) {
  const studentId = explicitStudentId ?? getSelectedStudentId();
  if (!studentId) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}studentId=${encodeURIComponent(studentId)}`;
}
