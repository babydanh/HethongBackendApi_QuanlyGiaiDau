#!/bin/bash

# Script cấu hình nâng trần File Descriptors (FD) & Tối ưu hoá mạng TCP cho WebSocket VPS

echo "=== Bắt đầu tối ưu hoá hệ thống cho WebSockets ==="

# 1. Nâng trần số lượng File Descriptors mở đồng thời cho toàn hệ thống
LIMITS_FILE="/etc/security/limits.conf"
if ! grep -q "nofile 65536" "$LIMITS_FILE"; then
    echo "Đang ghi cấu hình limits.conf..."
    sudo bash -c "cat >> $LIMITS_FILE <<EOF
* soft nofile 65536
* hard nofile 65536
root soft nofile 65536
root hard nofile 65536
EOF"
    echo "✓ Đã nâng giới hạn nofile lên 65536"
else
    echo "✓ limits.conf đã được cấu hình trước đó."
fi

# 2. Tinh chỉnh nhân mạng kernel Linux phục vụ truyền tải socket tốc độ cao
SYSCTL_FILE="/etc/sysctl.conf"
if ! grep -q "net.core.somaxconn" "$SYSCTL_FILE"; then
    echo "Đang ghi cấu hình sysctl.conf..."
    sudo bash -c "cat >> $SYSCTL_FILE <<EOF
# Số lượng kết nối chờ tối đa trong hàng đợi lắng nghe
net.core.somaxconn = 65535
# Tối đa số lượng socket ở trạng thái TIME_WAIT để tái sử dụng nhanh
net.ipv4.tcp_max_tw_buckets = 1440000
net.ipv4.tcp_tw_reuse = 1
# Tối ưu thời gian gửi gói tin Keepalive kiểm tra kết nối mạng (thay vì mặc định 2 tiếng)
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_keepalive_probes = 5
EOF"
    # Áp dụng thay đổi lập tức mà không cần reboot VPS
    sudo sysctl -p
    echo "✓ Đã áp dụng các thông số kernel mới cho hệ thống mạng TCP"
else
    echo "✓ sysctl.conf đã được cấu hình trước đó."
fi

echo "=== Hoàn tất tối ưu hoá VPS. Vui lòng restart terminal/ssh session của bạn ==="
