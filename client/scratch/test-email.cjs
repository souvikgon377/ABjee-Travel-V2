const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const smtpUser = process.env.SMTP_USER || 'abjeetourism@gmail.com';
const smtpPass = process.env.SMTP_PASS;

if (!smtpPass) {
  console.error('ERROR: SMTP_PASS environment variable is not set in .env file.');
  process.exit(1);
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
  to: 'abjeetourism@gmail.com',
  subject: 'Test SMTP Delivery',
  text: 'This is a test of the SMTP configuration for ABjee Tourism.',
};

console.log('Sending test email...');
transporter.sendMail(mailOptions)
  .then(info => {
    console.log('SUCCESS:', info.messageId);
    process.exit(0);
  })
  .catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
  });
