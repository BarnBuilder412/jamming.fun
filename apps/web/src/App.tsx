import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ArtistView } from './pages/ArtistView';
import { UserView } from './pages/UserView';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/artist" element={<ArtistView />} />
        <Route path="/room/:code" element={<UserView />} />
      </Routes>
    </BrowserRouter>
  );
}
