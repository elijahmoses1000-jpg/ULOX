import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);

// Offline shell: the tactic set, curriculum and engine are all client-side, so a
// cached shell means UloX keeps working with no connection.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const url = new URL('sw.js', document.baseURI).href;
        navigator.serviceWorker.register(url).catch(() => {
            /* offline support is a progressive enhancement */
        });
    });
}
