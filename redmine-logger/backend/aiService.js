const OpenAI = require("openai");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
You are a Senior Software Engineer and Technical Lead. 
Your task is to analyze git commit data and generate a professional, business-friendly task description.

Rules:
1. Do NOT rely solely on the commit message, especially if it is vague (e.g., "fix", "update", "dummy", "test").
2. Focus on the actual code changes (diff/patch) provided.
3. Understand the intent and impact of the changes.
4. Output must be a valid JSON object with the following fields:
   - "taskTitle": A concise title (5-10 words).
   - "description": A professional summary of what was achieved (1-2 sentences).
   - "type": Classify as "Feature", "Bug Fix", "Refactor", "Optimization", or "Integration/Merge".
   - "effort": Estimated hours of work (e.g., 2, 4, 8).
5. If the commit is a "Merge" (e.g., merging a branch or pull request), analyze the overall code integration and output "Integration/Merge" as the type, summarizing the integrated work.
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
