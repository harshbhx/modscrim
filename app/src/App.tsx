import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Landing } from './routes/Landing';
import { NotFound, Placeholder } from './routes/Placeholder';
import { Privacy } from './routes/Privacy';

/** Every route in PRD §9.1. Later tickets replace the placeholders. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="console" element={<Placeholder title="Console" />} />
        <Route path="mod/:channel" element={<Placeholder title="Mod console" />} />
        <Route path="overlay/:channel" element={<Placeholder title="Overlay" />} />
        <Route path="demo" element={<Placeholder title="Demo" />} />
        <Route path="demo/:room" element={<Placeholder title="Demo console" />} />
        <Route path="demo/:room/mod" element={<Placeholder title="Demo mod view" />} />
        <Route path="r/:reportId" element={<Placeholder title="Report" />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
