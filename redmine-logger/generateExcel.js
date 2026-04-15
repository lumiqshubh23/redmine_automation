const XLSX = require("xlsx");

// ===== CONFIG =====
const INPUT_FILE = "input.xlsx";
const OUTPUT_FILE = "timelog.xlsx";
const DEFAULT_ISSUE_ID = 158484;

const TOTAL_HOURS = 9;
const SCRUM_HOURS = 1;
const WORK_HOURS = TOTAL_HOURS - SCRUM_HOURS;

// ===== LEAVE =====
const LEAVE_DATES = [
    "2026-04-09",
    "2026-04-10",
    "2026-04-13",
];

// ===== WEEKEND CONTROL =====
const SATURDAY_DATES = [];
const SUNDAY_DATES = [];

// ===== DATE SETUP =====
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const today = now.getDate();

// ===== READ INPUT =====
const workbook = XLSX.readFile(INPUT_FILE);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(sheet);

// ===== RANDOM SPLIT =====
function splitHours(total, parts) {
  let remaining = total;
  const result = [];

  for (let i = 0; i < parts - 1; i++) {
    const max = remaining - (parts - i - 1);
    const value = Math.floor(Math.random() * max) + 1;
    result.push(value);
    remaining -= value;
  }

  result.push(remaining);
  return result;
}

// ===== MAIN =====
const finalData = [];
let taskIndex = 0; // 👈 ensures no duplicate usage

for (let i = 0; i < today; i++) {
  const dateObj = new Date(year, month, i + 1);
  const day = dateObj.getDay();

  const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;

  // 🛑 SKIP WEEKENDS
  if (day === 6 && !SATURDAY_DATES.includes(date)) continue;
  if (day === 0 && !SUNDAY_DATES.includes(date)) continue;

  // 🏖 LEAVE
  if (LEAVE_DATES.includes(date)) {
    finalData.push({
      date,
      issue_id: DEFAULT_ISSUE_ID,
      hours: TOTAL_HOURS,
      comments: "Leave",
    });
    continue;
  }

  // ✅ WORKING DAY
  const tasksForToday = [];

  let remainingWork = WORK_HOURS;

  while (remainingWork > 0 && taskIndex < rawData.length) {
    const row = rawData[taskIndex];

    const taskHours = Math.min(
      Math.floor(Math.random() * 4) + 1, // 1–4 hrs
      remainingWork
    );

    tasksForToday.push({
      date,
      issue_id: row.issue_id || DEFAULT_ISSUE_ID,
      hours: taskHours,
      comments: row.comments || "General Work",
    });

    remainingWork -= taskHours;
    taskIndex++; // 👈 move forward (no reuse)
  }

  // Push tasks
  finalData.push(...tasksForToday);

  // 🤝 Scrum
  finalData.push({
    date,
    issue_id: DEFAULT_ISSUE_ID,
    hours: SCRUM_HOURS,
    comments: "Daily Scrum Call",
  });

  // 🧠 If tasks finished early, remaining days won't duplicate
  if (taskIndex >= rawData.length) break;
}

// ===== CREATE EXCEL =====
const newSheet = XLSX.utils.json_to_sheet(finalData);
const newWorkbook = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(newWorkbook, newSheet, "TimeLog");

XLSX.writeFile(newWorkbook, OUTPUT_FILE);

console.log("✅ Final Excel generated (no duplicates):", OUTPUT_FILE);