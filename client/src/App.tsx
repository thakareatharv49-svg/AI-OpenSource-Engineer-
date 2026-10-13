import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing/Landing";
import Contribution from "./pages/Contribution/Contribution";
import AuthStatus from "./components/AuthStatus";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/contribution" element={<Contribution />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;