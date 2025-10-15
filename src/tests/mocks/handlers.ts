import { http, HttpResponse } from "msw";

const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1";

export const handlers = [
  http.post(`${OPENAI_BASE}/deep-research/sessions`, () => {
    return HttpResponse.json({
      id: "mock-session",
      questions: [
        {
          index: 1,
          text: "Mock question 1"
        }
      ]
    });
  }),
  http.post(`${GEMINI_BASE}/models/*:generateContent`, () => {
    return HttpResponse.json({
      candidates: [
        {
          content: {
            parts: [{ text: "Mock Gemini response" }]
          }
        }
      ]
    });
  })
];
