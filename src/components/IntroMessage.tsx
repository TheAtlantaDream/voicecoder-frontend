import "./IntroMessage.css";

export function IntroMessage() {
  return (
    <div className="intro">
      <p>
        I'm listening. Say what you'd like to change in your code, then pause. After a short silence I'll tidy up
        what you said and send it to the agent.
      </p>
      <p>Its reply appears here; your code updates in the editor.</p>
    </div>
  );
}
