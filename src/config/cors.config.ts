export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Cho phép tất cả các nguồn (origins) trong môi trường phát triển (bao gồm localhost, IP LAN và các cổng ngẫu nhiên của Flutter Web)
    callback(null, true);
  },
  credentials: true,
};
