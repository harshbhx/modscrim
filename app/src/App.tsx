import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { pages } from './copy';
import { Landing } from './routes/Landing';
import { NotFound, Placeholder } from './routes/Placeholder';
import { Privacy } from './routes/Privacy';

/** Every route in PRD §9.1. Later tickets replace the placeholders. */
export function App() {
  const { screens } = pages;
  return (
    <Routes>
      {/* The OBS overlay has no app chrome: T-24 draws it on a transparent 1920 by 1080 stage. */}
      <Route path="overlay/:channel" element={<Placeholder title={screens.overlay} />} />
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="console" element={<Placeholder title={screens.console} />} />
        <Route path="mod/:channel" element={<Placeholder title={screens.mod} />} />
        <Route path="demo" element={<Placeholder title={screens.demo} />} />
        <Route path="demo/:room" element={<Placeholder title={screens.demoConsole} />} />
        <Route path="demo/:room/mod" element={<Placeholder title={screens.demoMod} />} />
        <Route path="r/:reportId" element={<Placeholder title={screens.report} />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
