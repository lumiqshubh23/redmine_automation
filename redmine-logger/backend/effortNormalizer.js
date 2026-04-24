/**
 * Normalizes an array of commit/task entries so that each active day
 * has exactly 9 hours of logged work (1 hour Scrum, 8 hours across commits).
 */
function normalizeDailyEffort(entries) {
    if (!entries || entries.length === 0) return [];

    // 1. Group by Date
    const groupedByDate = {};
    for (const e of entries) {
        if (!groupedByDate[e.Date]) {
            groupedByDate[e.Date] = [];
        }
        groupedByDate[e.Date].push(e);
    }

    const normalizedEntries = [];

    // 2. Process each day
    // We sort the dates to guarantee chronological order
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(a) - new Date(b));

    for (const date of sortedDates) {
        // Add Scrum Call as the first task of the day
        normalizedEntries.push({
            "Date": date,
            "Commit": "Daily Scrum Call",
            "AI Task": "Daily Scrum Call",
            "Type": "Meeting",
            "Effort": 1,
            "Source ID": "N/A",
            "Branch": "N/A"
        });

        const dayCommits = groupedByDate[date];

        // Sum up the raw effort assigned by the AI agent
        let totalAiEffort = dayCommits.reduce((sum, c) => sum + (Number(c.Effort) || 1), 0);

        // Safeguard: If totalAiEffort is 0, give equal weights
        if (totalAiEffort <= 0) {
            totalAiEffort = dayCommits.length;
            dayCommits.forEach(c => c.Effort = 1);
        }

        let remainingTarget = 8; // 8 hours to distribute
        let distributedSoFar = 0;

        for (let i = 0; i < dayCommits.length; i++) {
            const c = dayCommits[i];
            const weight = (Number(c.Effort) || 1) / totalAiEffort;

            // For the last item, give it the exact mathematical remainder to avoid rounding drift
            let allocated;
            if (i === dayCommits.length - 1) {
                allocated = Math.round((remainingTarget - distributedSoFar) * 100) / 100;
            } else {
                allocated = Math.round((8 * weight) * 100) / 100;
                distributedSoFar += allocated;
            }

            c.Effort = allocated;
            normalizedEntries.push(c);
        }
    }

    return normalizedEntries;
}

module.exports = { normalizeDailyEffort };
