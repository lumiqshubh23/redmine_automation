const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const XLSX = require("xlsx");
const { summarizeCommit } = require("./aiService");
const { normalizeDailyEffort } = require("./effortNormalizer");

// --- CONFIGURATION ---
const FROM_DATE = process.env.FROM_DATE || firstDayOfCurrentMonth();
const TO_DATE = process.env.TO_DATE || todayDate();
const OUTPUT_FILE = "git_commits_excel.xlsx";
// ----------------------

const DEFAULT_ISSUE_ID = 158484;
const DEFAULT_HOURS = 1;
const EXCEL_HEADERS = ["Date", "Commit", "AI Task", "Type", "Effort", "Source ID", "Branch"];

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

function fetchLocalCommits({ fromDate, toDate }) {
    try {
        const branchName = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
        const format = "%ad|%s|%H";
        const cmd = `git log --since="${fromDate} 00:00:00" --until="${toDate} 23:59:59" --pretty=format:"${format}" --date=short`;
        console.log(`Executing: ${cmd}`);

        const output = execSync(cmd).toString().trim();
        if (!output) return [];

        return output.split("\n").map(line => {
            const [date, comments, sha] = line.split("|");
            return {
                date,
                comments: comments.trim(),
                source_id: sha,
                branch: branchName
            };
        });
    } catch (error) {
        console.error("Failed to fetch local commits:", error.message);
        return [];
    }
}

async function run() {
    console.log("Starting Local Git Commit Export...");

    try {
        const entries = fetchLocalCommits({
            fromDate: FROM_DATE,
            toDate: TO_DATE,
        });

        console.log(`Fetched ${entries.length} commits from local repository.`);

        if (entries.length === 0) {
            console.log("No commits found for the given date range.");
            return;
        }

        // Sort ascending (oldest first)
        entries.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Enrich with AI summaries
        console.log(`Enriching ${entries.length} commits with AI data...`);
        for (const e of entries) {
            let patch = "";
            try {
                // Use head -c to limit the output before it hits the Node.js buffer
                patch = execSync(`git show ${e.source_id} | head -c 15000`, { maxBuffer: 1 * 1024 * 1024 }).toString();
            } catch (err) {
                console.warn(`Could not get diff for ${e.source_id}:`, err.message);
            }
            const aiResult = await summarizeCommit(e.comments, patch);
            e.aiTask = aiResult.taskTitle;
            e.aiType = aiResult.type;
            e.aiEffort = aiResult.effort;
        }

        // Map to Excel format
        const excelData = entries.map(e => ({
            "Date": e.date,
            "Commit": e.comments,
            "AI Task": e.aiTask,
            "Type": e.aiType,
            "Effort": e.aiEffort,
            "Source ID": e.source_id,
            "Branch": e.branch
        }));

        const normalizedExcelData = normalizeDailyEffort(excelData);

        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet(normalizedExcelData, { header: EXCEL_HEADERS });
        XLSX.utils.book_append_sheet(workbook, sheet, "Commits");
        XLSX.writeFile(workbook, OUTPUT_FILE);

        console.log(`Successfully exported to ${path.resolve(OUTPUT_FILE)}`);
    } catch (error) {
        console.error("Export failed:", error.message);
    }
}

run();
