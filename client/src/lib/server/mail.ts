import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const smtpUser = process.env.SMTP_USER || 'abjeetourism@gmail.com';
const smtpPass = process.env.SMTP_PASS || '';

/**
 * Sends an email using SMTP transport.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!smtpPass) {
    console.warn('[MailService] SMTP_PASS is not configured. Email will not be sent.');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const mailOptions = {
    from: `"ABjee Tourism" <${smtpUser}>`,
    to,
    subject,
    text,
    html,
  };

  console.info(`[MailService] Sending email to: ${to}, Subject: "${subject}"`);
  const info = await transporter.sendMail(mailOptions);
  console.info('[MailService] Email sent successfully:', info.messageId);
  return info;
}
