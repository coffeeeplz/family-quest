import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { loadBackend } from './backend';
import './styles/tokens.css';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);

loadBackend()
  .then((backend) => {
    root.render(
      <StrictMode>
        <App backend={backend} />
      </StrictMode>,
    );
  })
  .catch((error) => {
    console.error(error);
    root.render(<p style={{ padding: 24 }}>앱을 시작하지 못했어요. 새로 고침해 주세요.</p>);
  });
