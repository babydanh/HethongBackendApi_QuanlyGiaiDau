const allowedOrigins = [
  'https://sporto.asia',
  'https://www.sporto.asia',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

export const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // 1. Cho phép request từ Native Mobile App (Flutter), server-to-server, curl, Postman (không có header Origin)
    if (!origin) {
      return callback(null, true);
    }

    // 2. Cho phép các domain chính thức và localhost dev
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      /^https:\/\/([a-z0-9-]+\.)?sporto\.asia$/i.test(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    // 3. Chặn tất cả các trang web lạ khác
    return callback(new Error(`CORS blocked: Origin ${origin} is not allowed.`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-App-Key',
    'X-Client-Id',
    'X-CSRF-Token',
  ],
  credentials: true,
};

