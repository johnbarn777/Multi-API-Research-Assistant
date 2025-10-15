import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("https://api.openai.com/v1/sessions", () => {
    return HttpResponse.json({
      id: "mock-session",
      questions: ["Mock question 1"]
    });
  }),
  http.post("https://generativelanguage.googleapis.com/v1/*", () => {
    return HttpResponse.json({
      candidates: [{ content: { parts: [{ text: "Mock Gemini response" }] } }]
    });
  })
];
