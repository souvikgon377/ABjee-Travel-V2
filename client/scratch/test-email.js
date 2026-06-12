const nodemailer = require('nodemailer');

const smtpHost = 'smtp.gmail.com';
const smtpPort = 465;
const smtpUser = 'abjeetourism@gmail.com';
const smtpPass = 'tkwuqnadpbeknled';

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
