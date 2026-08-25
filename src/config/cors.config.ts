const isProduction = process.env.NODE_ENV === 'production';

const productionAllowedOrigins = [
  'https://sporto.asia',
  'https://www.sporto.asia',
];

const developmentAllowedOrigins = [
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

    const normalizedOrigin = origin.replace(/\/$/, '');

    // 2. Kiểm tra theo môi trường:
    // Production: CHỈ cho phép domain chính thức sporto.asia (Chặn hoàn toàn localhost)
    // Development: Cho phép localhost & 127.0.0.1 để lập trình viên test
    const isAllowed = isProduction
      ? productionAllowedOrigins.includes(normalizedOrigin) ||
        /^https:\/\/([a-z0-9-]+\.)?sporto\.asia$/i.test(normalizedOrigin)
      : developmentAllowedOrigins.includes(normalizedOrigin) ||
        /^https:\/\/([a-z0-9-]+\.)?sporto\.asia$/i.test(normalizedOrigin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/i.test(normalizedOrigin);

    if (isAllowed) {
      return callback(null, true);
    }

    // 3. Chặn tất cả các trang web khác
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
    'x-app-key',
    'X-Client-Id',
    'x-client-id',
    'X-CSRF-Token',
    'x-csrf-token',
  ],
  credentials: true,
};

