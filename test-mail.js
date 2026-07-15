const nodemailer = require('nodemailer');
require('dotenv').config();

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = Number(process.env.SMTP_PORT) || 587;
const secure = process.env.SMTP_SECURE === 'true';
const user = process.env.SMTP_USER || 'vndcsport@gmail.com';
const pass = process.env.SMTP_PASS || 'sevktssqxvduaqfs';
const from = process.env.SMTP_FROM || '"VNDC Sport" <vndcsport@gmail.com>';

console.log('=== THỬ NGHIỆM GỬI MAIL SMTP ===');
console.log(`Host: ${host}`);
console.log(`Port: ${port}`);
console.log(`Secure: ${secure}`);
console.log(`User: ${user}`);
console.log(`Pass length: ${pass ? pass.length : 0} chars`);
console.log(`From: ${from}\n`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: {
    user,
    pass,
  },
  // Tăng thời gian chờ và hiển thị log debug chi tiết của socket
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  debug: true,
  logger: true,
});

async function run() {
  try {
    console.log('Đang thử kết nối SMTP...');
    await transporter.verify();
    console.log('✓ Kết nối SMTP thành công!');

    console.log('Đang thử gửi email test...');
    const info = await transporter.sendMail({
      from,
      to: 'macter.970@gmail.com', // Gửi thử tới mail admin của bạn
      subject: 'Test SMTP VNDC Sport',
      text: 'Kết nối SMTP test thành công từ website!',
      html: '<b>Kết nối SMTP test thành công từ website!</b>',
    });
    console.log('✓ Email đã được gửi đi thành công!');
    console.log('MessageId:', info.messageId);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Gửi mail THẤT BẠI. Chi tiết lỗi:');
    console.error(error);
    process.exit(1);
  }
}

run();
