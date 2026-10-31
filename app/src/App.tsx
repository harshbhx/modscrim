import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Landing } from './routes/Landing';
import { Mod } from './routes/Mod';
import { NotFound, Placeholder } from './routes/Placeholder';
import { Privacy } from './routes/Privacy';
import { SharedReport } from './routes/SharedReport';
import { Console } from './routes/Console';
import { Overlay } from './routes/Overlay';
import { Demo } from './routes/Demo';

/** Every route in PRD §9.1. */
export function App() {
  return <Routes>
    <Route path="overlay/:channel" element={<Overlay />} />
    <Route element={<Layout />}>
      <Route index element={<Landing />} />
      <Route path="console" element={<Console />} />
      <Route path="mod/:channel" element={<Mod />} />
      <Route path="demo" element={<Demo />} />
      <Route path="demo/:room" element={<Console />} />
      <Route path="demo/:room/mod" element={<Mod />} />
      <Route path="r/:reportId" element={<SharedReport />} />
      <Route path="privacy" element={<Privacy />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>;
}
