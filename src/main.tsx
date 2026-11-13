import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';
import { installUiScale } from './lib/uiScale';
import { installNewVersionReload } from './lib/newVersion';
import { installErrorReporting } from './lib/errorReport';
import { loadLocale } from './i18n';
import { detectLocale } from './i18n/locale';

installUiScale();
installNewVersionReload();
installErrorReporting();

// Словарь языка грузится до первого рендера, чтобы не мигал другой язык.
void loadLocale(detectLocale()).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
