import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing/Landing";
import Contribution from "./pages/Contribution/Contribution";
import MyContributions from "./pages/MyContributions/MyContributions";
import AuthStatus from "./components/AuthStatus";

function App() {
  return (
    <BrowserRouter>
      <AuthStatus />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/contribution" element={<Contribution />} />
        <Route path="/my-contributions" element={<MyContributions />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;