-- Tự động khởi tạo/cập nhật phiên bản App trong bảng system_configs cho PostgreSQL trên VPS
INSERT INTO "system_configs" ("key", "value", "description")
VALUES
  ('APP_ANDROID_LATEST_VERSION', '1.0.12', 'Phiên bản Android mới nhất'),
  ('APP_ANDROID_MINIMUM_VERSION', '1.0.10', 'Phiên bản Android tối thiểu yêu cầu'),
  ('APP_ANDROID_STORE_URL', 'https://play.google.com/store/apps/details?id=vn.vnsport.quanlygiaidau', 'Link CH Play'),
  ('APP_IOS_LATEST_VERSION', '1.0.12', 'Phiên bản iOS mới nhất'),
  ('APP_IOS_MINIMUM_VERSION', '1.0.10', 'Phiên bản iOS tối thiểu yêu cầu'),
  ('APP_IOS_STORE_URL', 'https://apps.apple.com/vn/app/vnsport/id6795829694', 'Link App Store'),
  ('APP_RELEASE_NOTES', 'VNSport đã có phiên bản mới với nhiều tính năng và cải tiến vượt trội. Vui lòng cập nhật để có trải nghiệm tốt nhất!')
ON CONFLICT ("key") 
DO UPDATE SET 
  "value" = EXCLUDED."value",
  "updated_at" = NOW();
