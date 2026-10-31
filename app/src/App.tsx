import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { pages } from './copy';
import { Landing } from './routes/Landing';
import { Mod } from './routes/Mod';
import { NotFound, Placeholder } from './routes/Placeholder';
import { Privacy } from './routes/Privacy';
import { SharedReport } from './routes/SharedReport';
import { Console } from './routes/Console';

/** Every route in PRD §9.1. */
export function App() {
  const { screens } = pages;
  return <Routes>
    <Route path="overlay/:channel" element={<Placeholder title={screens.overlay} />} />
    <Route element={<Layout />}>
      <Route index element={<Landing />} />
      <Route path="console" element={<Console />} />
      <Route path="mod/:channel" element={<Mod />} />
      <Route path="demo" element={<Placeholder title={screens.demo} />} />
      <Route path="demo/:room" element={<Placeholder title={screens.demoConsole} />} />
      <Route path="demo/:room/mod" element={<Mod />} />
      <Route path="r/:reportId" element={<SharedReport />} />
      <Route path="privacy" element={<Privacy />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>;
}
