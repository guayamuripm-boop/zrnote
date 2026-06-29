import { Queue } from 'bullmq';

const connection = {
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
};

export const meetingQueue = new Queue('meetings', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export async function enqueueAnalyze(meetingId: string) {
  return meetingQueue.add('ANALYZE_MEETING', { meetingId });
}

export async function enqueueSendEmails(meetingId: string) {
  return meetingQueue.add('SEND_EMAILS', { meetingId });
}
