const path = require("path");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const XLSX = require("xlsx");

let localSecrets = {};
try {
  localSecrets = require("./secreat.js");
} catch {
  // optional local overrides file
}

const app = express();
const PORT = process.env.PORT || 5000;
const REDMINE_URL = process.env.REDMINE_URL || localSecrets.REDMINE_URL || "http://svn.aps1aws.lumiq.int";
const REDMINE_API_KEY = process.env.REDMINE_API_KEY || localSecrets.API_KEY || "";
const REDMINE_ACTIVITY_ID = Number(process.env.REDMINE_ACTIVITY_ID || 9);

const DEFAULT_ISSUE_ID = 158484;
const DEFAULT_HOURS = 1;
const EXCEL_HEADERS = ["date", "issue_id", "hours", "comments", "source_id"];
const DATA_DIR = __dirname;
const DEFAULT_INPUT_XLSX = path.join(DATA_DIR, "input.xlsx");
const DEFAULT_TIMELOG_XLSX = path.join(DATA_DIR, "timelog.xlsx");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function firstDayOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeExcelDate(raw) {
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return toDateOnly(raw);
}

function parseExcelDateToIso(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue === "number") {
    const date = XLSX.SSF.parse_date_code(dateValue);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  return toDateOnly(dateValue);
}

function parseOwnerRepoFromRepository(ref) {
  const raw = String(ref || "")
    .trim()
    .replace(/\.git$/i, "");
  if (!raw) return null;

  const fromUrl = raw.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (fromUrl) {
    return { owner: fromUrl[1], repo: fromUrl[2].replace(/\.git$/i, "") };
  }

  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 2 && !raw.includes("://")) {
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
  }

  return null;
}

function makeExcelKey(entry) {
  return [
    normalizeExcelDate(entry.date) || "",
    String(entry.issue_id || ""),
    String(entry.hours || ""),
    (entry.comments || "").trim(),
    String(entry.source_id || ""),
  ].join("|");
}

async function fetchCommits({ owner, repo, username, token, branch, fromDate, toDate }) {
  const since = `${fromDate}T00:00:00Z`;
  const until = `${toDate}T23:59:59Z`;
  const headers = { Accept: "application/vnd.github+json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const isGlobalSearch = !owner || !repo;

  if (isGlobalSearch) {
    const allCommits = [];
    try {
      const eventsRes = await axios.get(`https://api.github.com/users/${username}/events`, {
        headers,
        params: { per_page: 100 }
      });

      const pushEvents = (eventsRes.data || []).filter(e => e.type === "PushEvent");
      const activeTargets = new Set();

      for (const ev of pushEvents) {
        if (!ev.repo || !ev.payload || !ev.payload.ref) continue;
        const evRepoName = ev.repo.name;
        const evBranch = ev.payload.ref.replace("refs/heads/", "");
        activeTargets.add(`${evRepoName}|${evBranch}`);
      }

      for (const target of activeTargets) {
        const [targetRepoFull, targetBranch] = target.split("|");
        const [targetOwner, targetRepo] = targetRepoFull.split("/");

        try {
          const commits = await fetchCommits({
            owner: targetOwner,
            repo: targetRepo,
            username,
            token,
            branch: targetBranch,
            fromDate,
            toDate
          });
          allCommits.push(...commits);
        } catch (subErr) {
          console.error(`Failed fetching for ${targetRepoFull}:${targetBranch}`, subErr.message);
        }
      }

      const uniqueCommits = [];
      const seenSha = new Set();
      for (const c of allCommits) {
        if (!seenSha.has(c.source_id)) {
          seenSha.add(c.source_id);
          uniqueCommits.push(c);
        }
      }

      uniqueCommits.sort((a, b) => new Date(b.date) - new Date(a.date));
      return uniqueCommits;

    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 404) {
        throw new Error("Could not access user events. Check token scopes.");
      }
      throw err;
    }
  }

  if (!branch) {
    try {
      let branchNames = [];
      let bPage = 1;
      while (true) {
        const branchesRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/branches`, {
          headers,
          params: { per_page: 100, page: bPage }
        });
        const fetched = branchesRes.data || [];
        if (fetched.length === 0) break;
        branchNames.push(...fetched.map(b => b.name));
        if (fetched.length < 100) break;
        bPage++;
      }

      const allBranchCommits = [];
      for (const bName of branchNames) {
        try {
          const commits = await fetchCommits({ owner, repo, username, token, branch: bName, fromDate, toDate });
          allBranchCommits.push(...commits);
        } catch (err) {
          console.error(`Failed on branch ${bName}`);
        }
      }

      const uniqueCommits = [];
      const seenSha = new Set();
      for (const c of allBranchCommits) {
        if (!seenSha.has(c.source_id)) {
          seenSha.add(c.source_id);
          uniqueCommits.push(c);
        }
      }
      uniqueCommits.sort((a, b) => new Date(b.date) - new Date(a.date));
      return uniqueCommits;
    } catch (err) {
      // safe fallback below
    }
  }

  const allCommits = [];
  let page = 1;

  try {
    while (true) {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits`, {
        headers,
        params: {
          author: username,
          since,
          until,
          sha: branch || undefined,
          per_page: 100,
          page,
        },
      });

      const commits = response.data || [];
      allCommits.push(...commits);

      if (commits.length < 100) break;
      if (page >= 10) break;

      page += 1;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      const scopes = error.response.headers["x-oauth-scopes"] || "";
      if (token && !scopes.includes("repo")) {
        throw new Error(
          `GitHub Repository '${owner}/${repo}' not found. Your token lacks 'repo' scope, which is required for private repositories.`
        );
      }
      throw new Error(
        `GitHub Repository '${owner}/${repo}' not found. Please check the URL/owner or ensure you have access.`
      );
    }
    throw error;
  }

  return allCommits
    .map((item) => {
      const commitDate =
        toDateOnly(item.commit?.author?.date) || toDateOnly(item.commit?.committer?.date);
      const messageLine = (item.commit?.message || "GitHub commit").split("\n")[0].trim();
      return {
        date: commitDate,
        issue_id: DEFAULT_ISSUE_ID,
        hours: DEFAULT_HOURS,
        comments: `GitHub: ${messageLine}`,
        source_id: item.sha,
      };
    })
    .filter((item) => item.date);
}

function readRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
}

function writeRows(filePath, rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_HEADERS });
  XLSX.utils.book_append_sheet(workbook, sheet, "Tasks");
  XLSX.writeFile(workbook, filePath);
}

function generateTimeLogRows({
  rawData,
  year,
  month,
  endDay,
  leaveDates = [],
  saturdayDates = [],
  sundayDates = [],
  totalHours = 9,
  scrumHours = 1,
}) {
  const workHours = totalHours - scrumHours;
  const finalData = [];
  let taskIndex = 0;

  for (let dayOfMonth = 1; dayOfMonth <= endDay; dayOfMonth += 1) {
    const dateObj = new Date(year, month - 1, dayOfMonth);
    const day = dateObj.getDay();
    const date = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;

    if (day === 6 && !saturdayDates.includes(date)) continue;
    if (day === 0 && !sundayDates.includes(date)) continue;

    if (leaveDates.includes(date)) {
      finalData.push({
        date,
        issue_id: DEFAULT_ISSUE_ID,
        hours: totalHours,
        comments: "Leave",
      });
      continue;
    }

    let remainingWork = workHours;
    while (remainingWork > 0 && taskIndex < rawData.length) {
      const row = rawData[taskIndex];
      const taskHours = Math.min(Math.floor(Math.random() * 4) + 1, remainingWork);
      finalData.push({
        date,
        issue_id: Number(row.issue_id) || DEFAULT_ISSUE_ID,
        hours: taskHours,
        comments: row.comments || "General Work",
      });
      remainingWork -= taskHours;
      taskIndex += 1;
    }

    finalData.push({
      date,
      issue_id: DEFAULT_ISSUE_ID,
      hours: scrumHours,
      comments: "Daily Scrum Call",
    });

    if (taskIndex >= rawData.length) break;
  }

  return finalData;
}

async function uploadTimeEntriesToRedmine({
  rows,
  redmineUrl = REDMINE_URL,
  apiKey = REDMINE_API_KEY,
  delayMs = 500,
}) {
  if (!apiKey) {
    throw new Error("REDMINE_API_KEY missing. Set it in secreat.js or REDMINE_API_KEY env.");
  }

  const result = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (const entry of rows) {
    try {
      const spentOn = parseExcelDateToIso(entry.date);
      const issueId = Number(entry.issue_id) || DEFAULT_ISSUE_ID;
      const hours = Number(entry.hours);

      if (!spentOn || !hours) {
        result.failed += 1;
        result.errors.push({ entry, error: "Invalid date or hours" });
        continue;
      }

      await axios.post(
        `${redmineUrl}/time_entries.json`,
        {
          time_entry: {
            issue_id: issueId,
            hours,
            comments: entry.comments || "Auto log",
            spent_on: spentOn,
            activity_id: REDMINE_ACTIVITY_ID,
          },
        },
        {
          headers: {
            "X-Redmine-API-Key": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      result.success += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        entry,
        error: error.response?.data || error.message,
      });
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return result;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/default-dates", (_req, res) => {
  res.json({
    fromDate: firstDayOfCurrentMonth(),
    toDate: todayDate(),
  });
});

app.post("/api/github/validate", async (req, res) => {
  const { username, token } = req.body || {};

  if (!username || !token) {
    return res.status(400).json({ error: "Username and token are required." });
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`
  };

  try {
    const response = await axios.get("https://api.github.com/user", { headers });
    const data = response.data;
    const scopes = response.headers["x-oauth-scopes"] || "";

    if (data.login.toLowerCase() !== username.toLowerCase()) {
      return res.status(400).json({
        error: `Token belongs to user '${data.login}', but you entered '${username}'.`
      });
    }

    const warnings = [];
    if (!scopes.includes("repo")) {
      warnings.push("Warning: This token lacks 'repo' scope. It cannot access private repositories.");
    }

    return res.json({
      valid: true,
      warnings,
      user: {
        login: data.login,
        avatar_url: data.avatar_url,
        name: data.name
      }
    });
  } catch (error) {
    const ghStatus = error.response?.status || "";
    const message = error.response?.data?.message || error.message || "GitHub validation failed";
    return res.status(500).json({ error: ghStatus ? `GitHub ${ghStatus}: ${message}` : message });
  }
});

app.post("/api/github/commits", async (req, res) => {
  const { repository, owner, repo, username, token, branch, fromDate, toDate } = req.body || {};

  const parsed = parseOwnerRepoFromRepository(repository);
  const resolvedOwner = (owner || parsed?.owner || "").trim();
  const resolvedRepo = (repo || parsed?.repo || "").trim();

  if (!username) {
    return res.status(400).json({ error: "GitHub username is required." });
  }

  const normalizedFrom = toDateOnly(fromDate) || firstDayOfCurrentMonth();
  const normalizedTo = toDateOnly(toDate) || todayDate();

  try {
    const entries = await fetchCommits({
      owner: resolvedOwner,
      repo: resolvedRepo,
      username,
      token,
      branch,
      fromDate: normalizedFrom,
      toDate: normalizedTo,
    });

    const commitNames = entries.map(e => e.comments.replace("GitHub: ", ""));

    return res.json({
      entries,
      commits: commitNames,
      fromDate: normalizedFrom,
      toDate: normalizedTo,
      total: entries.length
    });
  } catch (error) {
    const ghStatus = error.response?.status || "";
    const message = error.response?.data?.message || error.message || "GitHub request failed";
    return res.status(500).json({ error: ghStatus ? `GitHub ${ghStatus}: ${message}` : message });
  }
});

app.get("/api/excel/preview", (req, res) => {
  const which = String(req.query.which || "input").toLowerCase();
  const filePath = which === "timelog" ? DEFAULT_TIMELOG_XLSX : DEFAULT_INPUT_XLSX;

  try {
    if (!fs.existsSync(filePath)) {
      return res.json({ which, columns: [], rows: [], empty: true });
    }
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.json({ which, columns: [], rows: [], empty: true });
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return res.json({
      which,
      columns,
      rows,
      empty: rows.length === 0,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not read Excel file." });
  }
});

app.post("/api/excel/save", (req, res) => {
  const { entries } = req.body || {};
  const targetPath = DEFAULT_INPUT_XLSX;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: "entries must be a non-empty array." });
  }

  try {
    const currentRows = readRows(targetPath);
    const existingKeys = new Set(currentRows.map(makeExcelKey));
    const cleanNewRows = [];

    for (const entry of entries) {
      const normalized = {
        date: normalizeExcelDate(entry.date),
        issue_id: Number(entry.issue_id) || DEFAULT_ISSUE_ID,
        hours: Number(entry.hours) || DEFAULT_HOURS,
        comments: (entry.comments || "").trim() || "General Work",
        source_id: entry.source_id || "",
      };

      if (!normalized.date) continue;
      const key = makeExcelKey(normalized);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      cleanNewRows.push(normalized);
    }

    const finalRows = [...currentRows, ...cleanNewRows];
    writeRows(targetPath, finalRows);

    return res.json({
      added: cleanNewRows.length,
      totalRows: finalRows.length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Could not save Excel file." });
  }
});

app.post("/api/excel/generate", (req, res) => {
  const {
    year,
    month,
    endDay,
    leaveDates = [],
    saturdayDates = [],
    sundayDates = [],
    totalHours = 9,
    scrumHours = 1,
  } = req.body || {};

  const inputPath = DEFAULT_INPUT_XLSX;
  const outputPath = DEFAULT_TIMELOG_XLSX;

  try {
    const workbook = XLSX.readFile(inputPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet);

    const now = new Date();
    const targetYear = Number(year) || now.getFullYear();
    const targetMonth = Number(month) || now.getMonth() + 1;
    const targetEndDay = Number(endDay) || now.getDate();

    const finalData = generateTimeLogRows({
      rawData,
      year: targetYear,
      month: targetMonth,
      endDay: targetEndDay,
      leaveDates,
      saturdayDates,
      sundayDates,
      totalHours: Number(totalHours),
      scrumHours: Number(scrumHours),
    });

    const newSheet = XLSX.utils.json_to_sheet(finalData);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, "TimeLog");
    XLSX.writeFile(newWorkbook, outputPath);

    return res.json({
      rows: finalData.length,
      message: "Excel generated successfully.",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Excel generation failed." });
  }
});

app.post("/api/redmine/upload", async (req, res) => {
  const { delayMs = 500, apiKey } = req.body || {};
  const sourcePath = DEFAULT_TIMELOG_XLSX;

  try {
    const workbook = XLSX.readFile(sourcePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const result = await uploadTimeEntriesToRedmine({
      rows: data,
      redmineUrl: REDMINE_URL,
      apiKey: apiKey || REDMINE_API_KEY,
      delayMs: Number(delayMs),
    });

    return res.json({
      ...result,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Upload failed." });
  }
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`API server running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Kill the other process or use a different port.`);
  } else {
    console.error("Server error:", err.message);
  }
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
