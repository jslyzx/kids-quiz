import { useEffect, useState } from 'react';
import { getSelectedStudentId, subscribeSelectedStudentChange } from './selectedStudent';

export function useSelectedStudentId() {
  const [studentId, setStudentId] = useState(getSelectedStudentId);

  useEffect(() => subscribeSelectedStudentChange(() => {
    setStudentId(getSelectedStudentId());
  }), []);

  return studentId;
}
