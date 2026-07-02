const OpenAI = require("openai");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
You are a Senior Software Engineer and Technical Lead. 
Your task is to analyze git commit data and generate a professional, business-friendly task description for a timesheet.

Rules:
1. CRITICAL: Do NOT use "Merge branch...", "Merge pull request...", or anything containing the word "Merge" or "Branch" as a taskTitle. This is a STRICT requirement.
2. If the commit is a merge, the provided "Diff" contains the combined changes of the entire merge. You MUST analyze this Diff to identify the core features, bug fixes, or improvements that were integrated.
3. Your taskTitle MUST describe the actual functional change (e.g., "Implement User Authentication", "Fix checkout page layout", "Optimize database query performance").
4. If the diff is empty, look at the commit message, but NEVER repeat it if it's a merge message. Instead, use "General Development & Code Sync" as a last resort fallback, but try your best to find a better title from the context.
5. Output must be a valid JSON object with:
   - "taskTitle": A functional, professional title (5-10 words).
   - "description": A brief summary of what was achieved.
   - "type": Classify as "Feature", "Bug Fix", "Refactor", "Optimization", or "Development & Configuration".
   - "effort": Estimated hours of work (e.g., 2, 4).
`;

/**
 * Summarizes a commit based on its message and patch.
 * @param {string} message - The commit message.
 * @param {string} patch - The cumulative diff/patch of the commit.
 * @returns {Promise<Object>} - The AI generated task details.
 */
async function summarizeCommit(message, patch) {
    if (!process.env.OPENAI_API_KEY) {
        return {
            taskTitle: "AI Unavailable",
            description: "Missing OPENAI_API_KEY in .env",
            type: "N/A",
            effort: 0
        };
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // High performance and cost-effective
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `Analyze this git commit:\n\nCommit Message: ${message}\n\nCode Changes (Diff):\n${patch || "No diff available."}\n\nGenerate the JSON task summary.`
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error("[aiService] OpenAI Error:", error.message);
        return {
            taskTitle: "AI Summary Failed",
            description: message, // Fallback to original message
            type: "Other",
            effort: 1
        };
    }
}

module.exports = { summarizeCommit };
