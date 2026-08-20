export const corsOptions = {
  origin: true, // Cho phép tất cả origin (Web & Mobile Apps) truy cập API
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
