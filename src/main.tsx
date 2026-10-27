import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HmrcTradeMonitor } from './components/HmrcTradeMonitor';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="hmrc-standalone-main">
      <HmrcTradeMonitor />
    </main>
  </StrictMode>,
);
