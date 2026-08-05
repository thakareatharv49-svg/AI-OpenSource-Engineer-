import Navbar from "../../components/Navbar";
import Hero from "../../components/Hero";
import AgentGrid from "../../components/agents/AgentGrid";
import StartBuilding from "../../components/StartBuilding";

function Landing() {
  return (
    <>
      <Navbar />
      <Hero />
      <AgentGrid />
      <StartBuilding />
    </>
  );
}

export default Landing;