import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./config.js";
import { processExtractionJob } from "../services/extraction.js";

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const extractionQueue = new Queue("extraction", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { age: 3600 * 24 },
    removeOnFail: { age: 3600 * 24 * 7 },
  },
});

export const extractionDlq = new Queue("extraction-dlq", { connection });

export const extractionWorker = new Worker(
  "extraction",
  async (job) => {
    await processExtractionJob(job.data);
  },
  { connection, concurrency: 1 },
);

extractionWorker.on("failed", (job, error) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    extractionDlq.add("extraction-failed", {
      originalJobId: job.id,
      data: job.data,
      error: { message: error.message, stacktrace: error.stack },
    }).catch((err) => console.error("Failed to add to DLQ:", err));
  }
});

extractionWorker.on("error", (error) => {
  console.error("Extraction worker error:", error);
});
