import { useEffect, useRef } from 'react';
import { useBeforeUnload, useNavigate } from 'react-router-dom';

/* ========================================
   未保存离开拦截
   - 浏览器关闭/刷新：beforeunload 提示
   - 站内路由跳转：拦截 popstate/push，弹原生确认（轻量方案）
   用法：
     const { dirty, setDirty } = useBlockNavigation();
     // 表单变化时 setDirty(true)，保存成功后 setDirty(false)
   ======================================== */

export function useBlockNavigation() {
  const dirtyRef = useRef(false);
  useBeforeUnload(
    (event) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    },
    { capture: true },
  );

  // 拦截站内跳转：重写 history.pushState/replaceState 太侵入，这里用 popstate 兜底提示
  // 注意：react-router 的 Link 跳转无法被简单拦截，更彻底的方案是 useBlocker（v6.4+ data router）
  // 当前项目用 BrowserRouter 但未启用 data router，因此主要依赖 beforeunload + 页面内自行确认
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (dirtyRef.current) {
        const leave = window.confirm('当前有未保存的修改，确定要离开吗？');
        if (!leave) {
          // 用户取消：把历史推回去，避免真的离开
          window.history.pushState(null, '', window.location.href);
        }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setDirty = (value: boolean) => {
    dirtyRef.current = value;
  };

  return { dirtyRef, setDirty };
}
