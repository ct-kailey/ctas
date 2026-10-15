import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './components/ctds/tokens.css';
import { AppearanceProvider } from './appearance.jsx';
import { ToastProvider } from './ui.jsx';
import { ConfirmationProvider } from './confirmation.jsx';
import './styles.css';

document.title = 'AINS — SI·SM 작업실';
document.querySelector('meta[name="description"]')?.setAttribute('content', '프로젝트 자료, 요구사항과 의사결정을 연결하는 AINS 작업실');

const Screen = window.location.pathname.replace(/\/$/, '') === '/preview'
  ? lazy(() => import('./workflow-preview.jsx'))
  : lazy(() => import('./App.jsx'));

createRoot(document.getElementById('root')).render(<React.StrictMode><AppearanceProvider><ToastProvider><ConfirmationProvider><Suspense fallback={<div className="boot-screen">화면을 준비하고 있습니다.</div>}><Screen /></Suspense></ConfirmationProvider></ToastProvider></AppearanceProvider></React.StrictMode>);
