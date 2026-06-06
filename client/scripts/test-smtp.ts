import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { sendEmail } from '../src/lib/server/mail.js';

async function test() {
  console.log('Testing SMTP connection and sending a test email...');
  console.log('SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com');
  console.log('SMTP_PORT:', process.env.SMTP_PORT || '465');
  console.log('SMTP_USER:', process.env.SMTP_USER || 'abjeetourism@gmail.com');
  console.log('SMTP_PASS is configured:', !!process.env.SMTP_PASS);

  if (!process.env.SMTP_PASS) {
    console.error('Error: SMTP_PASS is empty. Please set your password in the .env file.');
    process.exit(1);
  }

  try {
    const info = await sendEmail({
      to: 'souvikgon377@gmail.com', // Test recipient
      subject: 'Test Email - ABjee Travel SMTP Diagnostics',
      text: 'This is a test email sent from the ABjee Travel server diagnostics script to verify that SMTP is configured correctly.',
      html: '<p>This is a <strong>test email</strong> sent from the ABjee Travel server diagnostics script to verify that SMTP is configured correctly.</p>',
    });

    console.log('Success! Test email sent successfully.');
    console.log('SMTP Response Info:', info);
  } catch (error) {
    console.error('SMTP Email sending failed with the following error:');
    console.error(error);
  }
}

test();
