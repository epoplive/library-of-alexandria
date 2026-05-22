import { Routes, Route } from 'react-router-dom';
import LessonIndex from './LessonIndex';
import LessonHost from './LessonHost';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LessonIndex />} />
      <Route path="/lesson/:slug" element={<LessonHost />} />
    </Routes>
  );
}
