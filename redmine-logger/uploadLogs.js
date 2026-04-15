const axios = require("axios");
const XLSX = require("xlsx");

// ===== CONFIG =====
const REDMINE_URL = "http://svn.aps1aws.lumiq.int";
const API_KEY = "dd65697ee0467b634e5871fc7547442474060e3e";
const FILE_PATH = "./timelog.xlsx";
const DEFAULT_ISSUE_ID = 158484;

// ===== READ EXCEL =====
const workbook = XLSX.readFile(FILE_PATH);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = XLSX.utils.sheet_to_json(sheet);

// ===== HELPER: FORMAT DATE =====
function formatDate(dateValue) {
  if (!dateValue) return null;

  // If Excel gives number (date serial)
  if (typeof dateValue === "number") {
    const date = XLSX.SSF.parse_date_code(dateValue);
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }

  // If string already
  return new Date(dateValue).toISOString().split("T")[0];
}

// ===== FUNCTION TO LOG TIME =====
async function logTime(entry) {
  try {
    const spent_on = formatDate(entry.date);
    const issue_id = entry.issue_id || DEFAULT_ISSUE_ID;

    // Validation
    if (!spent_on || !entry.hours) {
      console.log("⚠️ Skipping invalid row:", entry);
      return;
    }

    await axios.post(
      `${REDMINE_URL}/time_entries.json`,
      {
        time_entry: {
          issue_id: issue_id,
          hours: Number(entry.hours),
          comments: entry.comments || "Auto log",
          spent_on: spent_on,
          activity_id: 9 // 👈 ADD THIS
        },
      },
      {
        headers: {
          "X-Redmine-API-Key": API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Logged: ${spent_on} | Issue ${issue_id}`);
  } catch (error) {
    console.error(
      `❌ Failed:`,
      entry,
      error.response?.data || error.message
    );
  }
}

// ===== MAIN =====
async function main() {
  for (const entry of data) {
    await logTime(entry);

    // Small delay (500ms)
    await new Promise((res) => setTimeout(res, 500));
  }
}

main();