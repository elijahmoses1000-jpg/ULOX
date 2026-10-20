import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Onboarding } from './components/Onboarding';
import { ToastHost } from './components/ui';
import { useProfile } from './lib/profile';
import { Journey } from './pages/Journey';
import { Stage } from './pages/Stage';
import { Explore } from './pages/Explore';
import { Learn } from './pages/Learn';
import { Paths } from './pages/Paths';
import { RoadmapView } from './pages/RoadmapView';
import { Lab } from './pages/Lab';
import { Train } from './pages/Train';
import { PuzzlePlay } from './pages/PuzzlePlay';
import { Rush } from './pages/Rush';
import { Arena } from './pages/Arena';
import { Room } from './pages/Room';
import { Live } from './pages/Live';
import { Toolkit } from './pages/Toolkit';
import { Glossary } from './pages/Glossary';
import { Certificates, VerifyCertificate } from './pages/Certificates';
import { SharedBuild } from './pages/SharedBuild';
import { Gallery } from './pages/Gallery';
import { Book } from './pages/Book';
import { Me } from './pages/Me';

export default function App() {
  const restoreSession = useProfile(s => s.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  return (
    <ToastHost>
      <HashRouter>
        <Onboarding />
        <Shell>
          <Routes>
            <Route path="/" element={<Journey />} />
            <Route path="/journey/:stageId" element={<Stage />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/paths" element={<Paths />} />
            <Route path="/paths/:slug" element={<RoadmapView />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/learn/:slug" element={<Learn />} />
            <Route path="/lab" element={<Lab />} />
            <Route path="/lab/:preset" element={<Lab />} />
            <Route path="/train" element={<Train />} />
            <Route path="/train/:puzzleId" element={<PuzzlePlay />} />
            <Route path="/rush" element={<Rush />} />
            <Route path="/arena" element={<Arena />} />
            <Route path="/join" element={<Arena />} />
            <Route path="/arena/:roomId" element={<Room />} />
            <Route path="/live" element={<Live />} />
            <Route path="/toolkit" element={<Toolkit />} />
            <Route path="/glossary" element={<Glossary />} />
            <Route path="/certificates" element={<Certificates />} />
            <Route path="/verify/:code" element={<VerifyCertificate />} />
            {/* Short on purpose: these links get typed, pasted and printed. */}
            <Route path="/b/:code" element={<SharedBuild />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/book" element={<Book />} />
            <Route path="/me" element={<Me />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </HashRouter>
    </ToastHost>
  );
}
