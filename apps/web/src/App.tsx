import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { describeError, getCurrentAssembly, getHealth, type Health } from "./api";
import { clearToken, setToken, tokenWasRejected, useToken } from "./auth";
import { DirectorPage } from "./director/DirectorPage";
import { HistoryPage } from "./history/HistoryPage";
import { PreviewPage } from "./preview/PreviewPage";
import { ReviewPage } from "./review/ReviewPage";
import { UploadPage } from "./upload/UploadPage";

function TokenPrompt() {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) setToken(value);
  };
  return (
    <form className="card token-prompt" onSubmit={submit}>
      <h2>API token</h2>
      <p className="muted">
        Asked once and kept in this browser. It is sent as the bearer token on every request and on the live stream.
      </p>
      {tokenWasRejected() && <p className="error-text">The server rejected the last token. Enter it again.</p>}
      <div className="row">
        <input
          type="password" autoFocus autoComplete="off" spellCheck={false} placeholder="API_TOKEN"
          value={value} onChange={(e) => setValue(e.target.value)} aria-label="API token"
        />
        <button type="submit" className="primary" disabled={!value.trim()}>Save</button>
      </div>
    </form>
  );
}

function HealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getHealth().then(
        (h) => { if (alive) { setHealth(h); setError(null); } },
        (e) => { if (alive) { setHealth(null); setError(describeError(e)); } },
      );
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  return (
    <section className="card">
      <h2>Server health <span className="muted small">GET /health</span></h2>
      {error && <p className="error-text">Not reachable: {error}</p>}
      {!error && !health && <p className="muted">Checking…</p>}
      {health && (
        <table className="kv">
          <tbody>
            {Object.entries(health).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td className={v === true || v === "ok" || v === "up" ? "ok-text" : v === false || v === "down" ? "error-text" : ""}>
                  {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function HomePage() {
  const [planId, setPlanId] = useState("");
  useEffect(() => {
    let alive = true;
    getCurrentAssembly().then(
      (a) => { if (alive) setPlanId((cur) => cur || a.plan_id); },
      () => { /* No run yet, or the server is down: the health panel says which. */ },
    );
    return () => { alive = false; };
  }, []);

  return (
    <main className="page home">
      <h1>Cut Once</h1>
      <div className="home-links">
        <Link className="card link-card" to="/director"><h2>Director</h2><p>Run the demo: presence, progress, events, commands.</p></Link>
        <Link className="card link-card" to="/upload"><h2>Upload</h2><p>Send a drawing and watch the processing stages.</p></Link>
        <div className="card link-card">
          <h2>Review</h2>
          <p>Check an extracted plan against its drawings and approve it.</p>
          <div className="row">
            <input value={planId} onChange={(e) => setPlanId(e.target.value.trim())} placeholder="plan_id" aria-label="Plan id" />
            {planId
              ? <Link className="button" to={`/review/${encodeURIComponent(planId)}`}>Open</Link>
              : <span className="button disabled">Open</span>}
          </div>
        </div>
        <Link className="card link-card" to="/history"><h2>History</h2><p>Scrub through every version of the current run.</p></Link>
      </div>
      <HealthPanel />
    </main>
  );
}

function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p><Link to="/">Back to the start</Link></p>
    </main>
  );
}

/** Pages that fill the whole window, like the headset's view: no top bar. */
const BARE_PAGES = new Set(["/preview"]);

export function App() {
  const token = useToken();
  const { pathname } = useLocation();
  if (token && BARE_PAGES.has(pathname)) {
    return (
      <Routes>
        <Route path="/preview" element={<PreviewPage />} />
      </Routes>
    );
  }
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">Cut Once</Link>
        <nav>
          <NavLink to="/director">Director</NavLink>
          <NavLink to="/upload">Upload</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/preview">Preview</NavLink>
        </nav>
        {token && <button type="button" className="ghost small" onClick={() => clearToken()}>Forget token</button>}
      </header>
      {token ? (
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/director" element={<DirectorPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/review/:planId" element={<ReviewPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      ) : (
        <main className="page">
          <TokenPrompt />
          <HealthPanel />
        </main>
      )}
    </div>
  );
}
