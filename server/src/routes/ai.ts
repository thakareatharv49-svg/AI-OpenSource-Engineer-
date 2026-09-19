import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { Router } from "express";

dotenv.config();

const router = Router();

function getAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
}

async function generateJSON(prompt: string) {
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
  });

  const text = response.text;

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  const cleanedText = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleanedText);
}

router.post("/select-issue", async (req, res) => {
  try {
    const { issues } = req.body;

    if (!Array.isArray(issues) || issues.length === 0) {
      return res.status(400).json({ error: "No issues provided" });
    }

    const result = await generateJSON(`
You are an AI assistant helping a developer find a good open-source contribution.
Choose the best beginner/intermediate GitHub issue.

Consider clarity, difficulty, actionability, and independent completion.

GitHub issues:
${JSON.stringify(issues, null, 2)}

Return ONLY valid JSON:
{
  "selectedIssueId": number,
  "reason": "short explanation",
  "difficulty": "Easy | Medium | Hard",
  "confidence": number
}
`);

    return res.json({
      message: "AI issue selection completed",
      result,
    });
  } catch (error) {
    console.error("AI selection error:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to select issue using Gemini",
    });
  }
});

router.post("/analyze-repository", async (req, res) => {
  try {
    const { repository, issue } = req.body;

    if (!repository || !issue) {
      return res.status(400).json({ error: "Repository and issue are required" });
    }

    const result = await generateJSON(`
You are an expert open-source repository analyst.
Analyze the repository and selected issue below.

Repository: ${repository}
Issue:
${JSON.stringify(issue, null, 2)}

Do not pretend to inspect files you cannot access. Based only on the supplied information,
provide a practical preliminary analysis.

Return ONLY valid JSON with:
{
  "repositoryOverview": "...",
  "summary": "...",
  "relevantFiles": ["..."],
  "rootCause": "...",
  "recommendedApproach": "...",
  "risks": ["..."]
}
`);

    return res.json({
      message: "Repository analysis completed",
      result,
    });
  } catch (error) {
    console.error("Repository analysis error:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to analyze repository",
    });
  }
});

router.post("/build-solution", async (req, res) => {
  try {
    const { repository, issue, repositoryAnalysis } = req.body;

    if (!repository || !issue || !repositoryAnalysis) {
      return res.status(400).json({
        error: "Repository, issue, and repository analysis are required",
      });
    }

    const result = await generateJSON(`
You are an expert software engineer preparing an open-source contribution.
Create a clear implementation plan for the selected issue.

Repository: ${repository}
Issue:
${JSON.stringify(issue, null, 2)}

Repository analysis:
${JSON.stringify(repositoryAnalysis, null, 2)}

Do not claim that code was changed or tests were executed.
Return ONLY valid JSON:
{
  "solutionSummary": "...",
  "implementationSteps": ["..."],
  "filesToModify": ["..."],
  "codeChanges": ["..."],
  "testsToAdd": ["..."],
  "potentialProblems": ["..."]
}
`);

    return res.json({
      message: "Solution plan created",
      result,
    });
  } catch (error) {
    console.error("Build solution error:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to build solution",
    });
  }
});

router.post("/generate-code", async (req, res) => {
  try {
    const { repository, issue, repositoryAnalysis, solutionPlan, files } =
      req.body;

    if (
      !repository ||
      !issue ||
      !repositoryAnalysis ||
      !solutionPlan
    ) {
      return res.status(400).json({
        error:
          "Repository, issue, repository analysis, and solution plan are required",
      });
    }

    const result = await generateJSON(`
You are a careful open-source coding agent.

Your task is to prepare proposed code changes for a GitHub issue.
You must not claim that files were modified, code was executed, or tests passed.
Only generate a proposal based on the information provided.

Repository: ${repository}

Issue:
${JSON.stringify(issue, null, 2)}

Repository analysis:
${JSON.stringify(repositoryAnalysis, null, 2)}

Solution plan:
${JSON.stringify(solutionPlan, null, 2)}

Available repository files, if supplied:
${JSON.stringify(files ?? [], null, 2)}

If actual source files are not supplied, clearly state that the proposal is
preliminary and do not invent exact existing code.

Return ONLY valid JSON in this format:
{
  "summary": "...",
  "assumptions": ["..."],
  "changes": [
    {
      "file": "path/to/file",
      "purpose": "...",
      "before": "existing code only if supplied; otherwise empty string",
      "after": "proposed code or pseudocode",
      "explanation": "..."
    }
  ],
  "tests": [
    {
      "file": "path/to/test_file",
      "description": "...",
      "code": "proposed test code or pseudocode"
    }
  ],
  "verificationSteps": ["..."],
  "warnings": ["..."]
}
`);

    return res.json({
      message: "Code proposal generated",
      result,
    });
  } catch (error) {
    console.error("Code generation error:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate code proposal",
    });
  }
});

export default router;