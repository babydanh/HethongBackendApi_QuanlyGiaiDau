export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const isProd = process.env.NODE_ENV === 'production';
    const allowedOrigins = [
      'https://giaidau.vnvar.com',
      'https://www.giaidau.vnvar.com'
    ];

    if (!isProd || !origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
};
