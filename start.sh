#!/bin/sh

# 容器启动脚本 — 启动 Node.js 服务（前台运行）
# Node.js 同时提供：静态文件服务、API 代理、数据库查询
# 使用 exec 替换进程，确保 Node.js 直接接收 Docker SIGTERM 信号
cd /app/server
exec node index.js
