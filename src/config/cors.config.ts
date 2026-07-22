export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Luôn cho phép request không có header origin (App Mobile Native / Postman / Server-to-Server)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = [
      'https://giaidau.vnvar.com',
      'https://www.giaidau.vnvar.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://localhost',
      'capacitor://localhost',
      'ionic://localhost',
    ];

    // Cho phép nếu nằm trong Whitelist hoặc là IP nội bộ/localhost trong lúc dev/test mobile
    if (
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('http://10.0.2.2') ||
      process.env.NODE_ENV !== 'production'
    ) {
      callback(null, true);
    } else {
      callback(null, true); // Cho phép tất cả origin kết nối nếu là API public cho Mobile App
    }
  },
  credentials: true,
};
