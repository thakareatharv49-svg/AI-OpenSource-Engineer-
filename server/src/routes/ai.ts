import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { Router } from "express";

dotenv.config();

const router = Router();

router.post("/select-issue", async (req, res) => {
  try {
    const { issues } = req.body;

    if (!Array.isArray(issues) || issues.length === 0) {
      return res.status(400).json({
        error: "No issues provided",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured",
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const prompt = `
You are an AI assistant helping a developer find a good open-source contribution.

Analyze the following GitHub issues and choose the BEST issue for a beginner/intermediate developer.

Consider:
- Clear problem description
- Reasonable implementation difficulty
- Good chance of completing the task successfully
- Whether the issue appears actionable
- Whether it is suitable for an independent contribution

GitHub issues:

${JSON.stringify(issues, null, 2)}

Return ONLY valid JSON in this exact format:

{
  "selectedIssueId": number,
  "reason": "short explanation",
  "difficulty": "Easy | Medium | Hard",
  "confidence": number
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    const text = response.text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned an empty response",
      });
    }

    const cleanedText = text
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const result = JSON.parse(cleanedText);

    return res.json({
      message: "AI issue selection completed",
      result,
    });
  } catch (error) {
    console.error("AI selection error:", error);

    return res.status(500).json({
      error: "Failed to select issue using Gemini",
    });
  }
});

export default router;