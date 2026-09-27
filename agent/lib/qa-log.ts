// Durable QA records, stored in Neon: every render's checks, defects and passes, plus what users
// say about the result. This is what the render policy learns from, and the only ground truth
// for measuring the fact-check itself.

export { saveQaFeedback, saveQaRun } from "./db";
