import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const emptyRow = () => ({
  date: new Date().toISOString().slice(0, 10),
  issue_id: 158484,
  hours: 1,
  comments: "Manual task",
  source_id: "",
});

export default function App() {
  const [form, setForm] = useState({
    repository: "",
    token: "",
    username: "",
    branch: "",
    fromDate: "",
    toDate: "",
  });
  const [github, setGithub] = useState(() => {
    const saved = localStorage.getItem("github_config");
    return saved ? JSON.parse(saved) : { connected: false, username: "", token: "", user: null };
  });
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState({ text: "Ready.", error: false });
  const [excelPreview, setExcelPreview] = useState(null);

  useEffect(() => {
    if (github.connected) {
      localStorage.setItem("github_config", JSON.stringify(github));
    } else {
      localStorage.removeItem("github_config");
    }
  }, [github]);

  const statusClass = useMemo(() => (status.error ? "status error" : "status"), [status.error]);

  useEffect(() => {
    async function loadDefaults() {
      try {
        const res = await fetch(`${API_BASE}/api/default-dates`);
        const data = await res.json();
        setForm((prev) => ({ ...prev, fromDate: data.fromDate, toDate: data.toDate }));
      } catch (_error) {
        const now = new Date();
        setForm((prev) => ({
          ...prev,
          fromDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
          toDate: now.toISOString().slice(0, 10),
        }));
      }
    }
    loadDefaults();
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setMessage(text, error = false) {
    setStatus({ text, error });
  }

  function mergeUniqueRows(existing, incoming) {
    const keys = new Set(
      existing.map((item) =>
        [item.date, item.issue_id, item.hours, item.comments, item.source_id || ""].join("|")
      )
    );
    const merged = [...existing];

    incoming.forEach((item) => {
      const key = [item.date, item.issue_id, item.hours, item.comments, item.source_id || ""].join("|");
      if (!keys.has(key)) {
        keys.add(key);
        merged.push(item);
      }
    });

    return merged;
  }

  async function handleConnect() {
    if (!form.username.trim() || !form.token.trim()) {
      setMessage("GitHub Username and Token are required to connect.", true);
      return;
    }

    setMessage("Connecting to GitHub...");
    try {
      const res = await fetch(`${API_BASE}/api/github/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          token: form.token.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Connection failed.", true);
        return;
      }

      setGithub({
        connected: true,
        username: form.username.trim(),
        token: form.token.trim(),
        user: data.user,
      });
      setMessage(`Connected as ${data.user.login}.`);
    } catch (error) {
      setMessage(error.message || "Could not connect to GitHub.", true);
    }
  }

  function handleDisconnect() {
    setGithub({ connected: false, username: "", token: "", user: null });
    setMessage("Disconnected from GitHub.");
  }

  async function handleImport() {
    setMessage("Importing commits from GitHub...");
    try {
      const res = await fetch(`${API_BASE}/api/github/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: form.repository.trim(),
          username: github.username,
          token: github.token,
          branch: form.branch.trim(),
          fromDate: form.fromDate,
          toDate: form.toDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not import commits.", true);
        return;
      }

      setRows((prev) => mergeUniqueRows(prev, data.entries || []));
      setMessage(`Imported ${data.total} commits from ${data.fromDate} to ${data.toDate}.`);
    } catch (error) {
      setMessage(error.message || "GitHub import failed.", true);
    }
  }

  async function handleSave() {
    if (rows.length === 0) {
      setMessage("No tasks available to save.", true);
      return;
    }

    setMessage("Saving rows to Excel...");
    try {
      const res = await fetch(`${API_BASE}/api/excel/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not save to Excel.", true);
        return;
      }

      setMessage(`Saved successfully. ${data.added} new rows added.`);
    } catch (error) {
      setMessage(error.message || "Save failed.", true);
    }
  }

  async function handleGenerateExcel() {
    setMessage("Generating timelog...");
    try {
      const res = await fetch(`${API_BASE}/api/excel/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not generate Excel.", true);
        return;
      }
      setMessage(`Timelog generated (${data.rows} rows).`);
    } catch (error) {
      setMessage(error.message || "Generate excel failed.", true);
    }
  }

  async function handleUploadRedmine() {
    setMessage("Uploading logs to Redmine...");
    try {
      const res = await fetch(`${API_BASE}/api/redmine/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not upload logs.", true);
        return;
      }
      setMessage(`Upload done. Success: ${data.success}, Failed: ${data.failed}.`);
    } catch (error) {
      setMessage(error.message || "Redmine upload failed.", true);
    }
  }

  async function loadExcelPreview(which) {
    setMessage(which === "timelog" ? "Loading timelog preview..." : "Loading input sheet preview...");
    try {
      const res = await fetch(`${API_BASE}/api/excel/preview?which=${encodeURIComponent(which)}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not load Excel preview.", true);
        setExcelPreview(null);
        return;
      }
      setExcelPreview(data);
      setMessage(data.empty ? "Sheet is empty." : `Showing ${which === "timelog" ? "timelog" : "input"} sheet (${data.rows.length} rows).`);
    } catch (error) {
      setMessage(error.message || "Preview failed.", true);
      setExcelPreview(null);
    }
  }

  function updateRow(index, key, value) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  return (
    <main className="container">
      <section className="hero">
        <h1>GitHub Commit to Excel Logger</h1>
        <p>Import your commits, add task rows, then save to Excel.</p>
      </section>

      {!github.connected ? (
        <section className="card highlight">
          <h2>Connect to GitHub</h2>
          <p className="muted">Enter your GitHub credentials to start syncing tasks. Your token is stored locally in your browser.</p>
          <div className="grid">
            <label>
              GitHub Username
              <input
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
                placeholder="your-github-login"
              />
            </label>
            <label>
              Personal Access Token
              <input
                type="password"
                value={form.token}
                onChange={(e) => setField("token", e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
              />
            </label>
          </div>
          <div className="actions">
            <button className="primary" onClick={handleConnect}>Connect GitHub Account</button>
          </div>
          <p className={statusClass}>{status.text}</p>
        </section>
      ) : (
        <section className="card">
          <div className="card-header">
            <h2>GitHub Sync</h2>
            <div className="user-badge">
              {github.user?.avatar_url && <img src={github.user.avatar_url} alt="avatar" />}
              <span>{github.user?.name || github.username}</span>
              <button className="text-btn" onClick={handleDisconnect}>Disconnect</button>
            </div>
          </div>
          <div className="grid">
            <label className="span-2">
              Repository (optional, leave blank for all repos)
              <input
                value={form.repository}
                onChange={(e) => setField("repository", e.target.value)}
                placeholder="URL or owner/repo (optional)"
              />
            </label>
            <label>
              Branch (optional)
              <input value={form.branch} onChange={(e) => setField("branch", e.target.value)} placeholder="main" />
            </label>
            <label>
              From Date
              <input type="date" value={form.fromDate} onChange={(e) => setField("fromDate", e.target.value)} />
            </label>
            <label>
              To Date
              <input type="date" value={form.toDate} onChange={(e) => setField("toDate", e.target.value)} />
            </label>
          </div>

          <div className="actions">
            <button className="primary" type="button" onClick={handleImport}>
              Import GitHub Commits
            </button>
            <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
              Add Task
            </button>
            <button className="success" type="button" onClick={handleSave}>
              Save to Excel
            </button>
            <button type="button" onClick={handleGenerateExcel}>
              Generate Excel
            </button>
            <button className="success" type="button" onClick={handleUploadRedmine}>
              Upload to Redmine
            </button>
          </div>
          <p className={statusClass}>{status.text}</p>
        </section>
      )}

      <section className="card">
        <h2>View Excel in Browser</h2>
        <div className="actions">
          <button type="button" onClick={() => loadExcelPreview("input")}>
            View input sheet
          </button>
          <button type="button" onClick={() => loadExcelPreview("timelog")}>
            View timelog sheet
          </button>
        </div>
        {excelPreview && (
          <div className="table-wrap preview-wrap">
            {excelPreview.empty ? (
              <p className="muted">No rows in this sheet.</p>
            ) : (
              <table className="preview-table">
                <thead>
                  <tr>
                    {excelPreview.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.rows.map((row, idx) => (
                    <tr key={idx}>
                      {excelPreview.columns.map((col) => (
                        <td key={col}>{row[col] != null ? String(row[col]) : ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Task Preview</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Issue ID</th>
                <th>Hours</th>
                <th>Comments</th>
                <th>Source ID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No tasks added yet.</td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.source_id || "manual"}-${index}`}>
                    <td>
                      <input type="date" value={row.date || ""} onChange={(e) => updateRow(index, "date", e.target.value)} />
                    </td>
                    <td>
                      <input type="number" value={row.issue_id || ""} onChange={(e) => updateRow(index, "issue_id", e.target.value)} />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={row.hours || ""}
                        onChange={(e) => updateRow(index, "hours", e.target.value)}
                      />
                    </td>
                    <td>
                      <input value={row.comments || ""} onChange={(e) => updateRow(index, "comments", e.target.value)} />
                    </td>
                    <td>
                      <input value={row.source_id || ""} onChange={(e) => updateRow(index, "source_id", e.target.value)} />
                    </td>
                    <td>
                      <button className="delete-btn" type="button" onClick={() => setRows((prev) => prev.filter((_item, i) => i !== index))}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
