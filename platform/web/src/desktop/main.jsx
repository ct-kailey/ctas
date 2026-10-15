import React from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import '../components/ctds/tokens.css';
import { DesktopTheme } from './DesktopTheme.jsx';
import { DesktopApp } from './DesktopApp.jsx';

createRoot(document.getElementById('root')).render(<React.StrictMode><DesktopTheme><DesktopApp /></DesktopTheme></React.StrictMode>);
