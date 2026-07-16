import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';

/**
 * 后端就绪守卫
 *
 * 在渲染页面路由之前，先轮询 /api/health 确认后端已启动。
 * 后端未就绪时显示加载动画，避免页面发出大量注定失败的 API 请求。
 */
const BackendReady: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const check = () => {
      // 走 Vite 代理（同源，避免 CORS 和跨端口问题）
      fetch('/health', { cache: 'no-store' })
        .then((r) => {
          if (r.ok) {
            if (!cancelled) setReady(true);
          } else {
            throw new Error(`HTTP ${r.status}`);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setElapsed((s) => s + 1);
          timer = setTimeout(check, 1500);
        });
    };

    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (ready) return <>{children}</>;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: 16,
    }}>
      <Spin size="large" />
      <div style={{ color: '#999', fontSize: 13 }}>
        {elapsed > 0 ? `等待后端服务就绪... (${elapsed})` : '正在连接后端服务'}
      </div>
    </div>
  );
};

export default BackendReady;
