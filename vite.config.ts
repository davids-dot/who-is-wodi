import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// 从 package.json 读取 appKey，用于设置 base 路径和 API 前缀
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))
const pkgAppKey = pkg.fde?.appKey || pkg.name || 'app'

// Vite 标准配置 — AI 复制模板后通常无需修改此文件
export default defineConfig(({ mode }) => {
  // 加载 .env 文件中的环境变量
  const env = loadEnv(mode, process.cwd(), '')
  const boxIP = env.BOX_IP || env.MYSQL_HOST || 'localhost'

  // 公网模式：VITE_BASE_PATH 默认 '/'，VITE_APP_KEY 默认空字符串
  // 盒子模式：VITE_BASE_PATH='/<appKey>/'，VITE_APP_KEY='<appKey>'
  const basePath = process.env.VITE_BASE_PATH || `/${pkgAppKey}/`
  const appKey = process.env.VITE_APP_KEY !== undefined ? process.env.VITE_APP_KEY : pkgAppKey

  return {
    // 静态资源基础路径：公网模式 '/'，盒子模式 '/<appKey>/'
    // 构建产物中的所有资源引用都会带上此前缀
    base: basePath,

    plugins: [react()],

    // 注入全局常量，前端通过 __APP_KEY__ 构建 API 路径
    // 公网模式为空字符串（API_BASE=''），盒子模式为 appKey（API_BASE='/api/<appKey>'）
    define: {
      __APP_KEY__: JSON.stringify(appKey),
    },

    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        // luya AgentOS API + WebSocket 代理 — luya 不走 /api 前缀，直接 /luya/v1/...
        // 前端请求 /luya/v1/... → Vite 代理到盒子网关 :80 → Gateway → luya 服务
        // WS 连接 ws://localhost:5173/luya/v1/ws → Vite WS 代理到盒子网关 :80
        // Gateway 会解析 NS-TOKEN 并注入 ns-org-id/ns-user-id header
        '/luya': {
          target: `http://${boxIP}:80`,  // 走盒子网关
          changeOrigin: true,
          ws: true,  // 启用 WebSocket 代理（luya 聊天流式响应需要）
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // 确保 Host header 指向盒子网关，而不是 localhost
              proxyReq.setHeader('Host', `${boxIP}:80`)
            })
          },
        },
        // 开发模式：登录页面代理到盒子
        // 前端访问 /uc/sign-in → 盒子网关 /uc/sign-in
        '/uc': {
          target: `http://${boxIP}:80`,  // 走盒子网关
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('Host', `${boxIP}:80`)
            })
          },
        },
        // 开发模式：UC API 代理到盒子
        // 前端访问 /api/uc/... → 盒子网关 /api/uc/...
        '/api/uc': {
          target: `http://${boxIP}:80`,  // 走盒子网关
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('Host', `${boxIP}:80`)
            })
          },
        },
        // 开发模式下 Vite 充当网关角色：
        // 盒子模式：前端请求 /api/<appKey>/game/... → Vite 去掉 /api → /<appKey>/game/... → Node.js 服务
        // 公网模式：前端请求 /game/... → Vite 直接代理到 Node.js 服务
        // 5201 是 Node.js 后端固定监听端口（与 server/index.js 的默认值一致）
        ...(appKey
          ? {
              '/api': {
                target: 'http://localhost:5201',
                changeOrigin: true,
                rewrite: (p: string) => p.replace(/^\/api/, ''),
              },
            }
          : {
              '/game': {
                target: 'http://localhost:5201',
                changeOrigin: true,
              },
              '/db': {
                target: 'http://localhost:5201',
                changeOrigin: true,
              },
            }),
      },
    },

    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
        },
      },
    },
  }
})
