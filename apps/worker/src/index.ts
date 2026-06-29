import { Worker } from 'bullmq';
import { transcribeMeeting } from './jobs/transcribe';
import { analyzeMeeting } from './jobs/analyze';
import { sendEmailsJob } from './jobs/send-emails';

const connection = {
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
};

const worker = new Worker(
  'meetings',
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'TRANSCRIBE_MEETING':
        await transcribeMeeting(job.data.meetingId);
        break;
      case 'ANALYZE_MEETING':
        await analyzeMeeting(job.data.meetingId);
        break;
      case 'SEND_EMAILS':
        await sendEmailsJob(job.data.meetingId);
        break;
      default:
        console.warn(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log('Worker started, listening for jobs...');
