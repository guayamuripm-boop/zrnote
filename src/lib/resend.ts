// Resend is handled by Supabase Edge Function (process-meeting)
// This file is kept for backwards compatibility

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<string> {
  // Emails are now sent via Edge Function
  console.log('Email sending delegated to Edge Function');
  return 'delegated';
}
