import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <main>Mod Fire Drill</main>;
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing application root');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
