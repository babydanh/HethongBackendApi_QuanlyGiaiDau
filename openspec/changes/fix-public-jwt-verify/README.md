# fix-public-jwt-verify

GET /tournaments/:id (route public): xác minh JWT bằng strategy của app, không tin payload thô; token giả, sai chữ ký hoặc hết hạn thì coi như khách.
