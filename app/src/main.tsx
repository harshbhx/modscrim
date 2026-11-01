import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/fonts.css';
import './styles/tokens.css';
// The shared design system: generated from brand/DESIGN.md, then the ModScrim
// override layer. Loaded after styles/tokens.css so --color-* wins where both
// define a role, and shared with site/ rather than copied into the app.
import '../../design/tokens.css';
import '../../design/tokens.override.css';
import './styles/base.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing application root');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
