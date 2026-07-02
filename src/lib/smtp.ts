import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    await transporter.sendMail({
      from: `"ZRNote" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    console.error('SMTP error:', err.message);
    return { ok: false, error: err.message };
  }
}
