# 谁是卧底 AI 对战 — 项目启动指南

## 项目简介

6 个 AI 虚拟人物围坐圆桌玩"谁是卧底"游戏，由大语言模型驱动描述与投票。

- **前端**：React 18 + Vite 5 + TypeScript + Ant Design 6
- **后端**：Node.js + Express，提供游戏 API、静态文件服务
- **LLM**：兼容 OpenAI API 格式的大模型（DeepSeek / DashScope / vLLM 本地模型）

---

## 一、本地开发启动

### 1. 安装依赖

前端和后端分别安装依赖：

```bash
# 前端依赖（项目根目录）
npm install

# 后端依赖
cd server
npm install
cd ..
```

### 2. 配置环境变量

复制环境变量模板并填写实际值：

```bash
cp .env.example .env
```

编辑 `.env` 文件，必填项：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `LLM_BASE_URL` | LLM API 地址（含 `/v1`） | `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | LLM API 密钥 | `sk-xxxxxxxx` |
| `LLM_MODEL_CHAT` | 文本对话模型名称 | `deepseek-chat` |
| `LLM_PROVIDER` | LLM 提供商标识 | `deepseek` / `dashscope` / `vllm` |
| `NACOS_ENABLED` | Nacos 服务注册（本地开发设为 `false`） | `false` |
| `BASE_PATH` | 后端路由前缀（本地开发留空） | （空） |

### 3. 启动服务

需要同时启动前端和后端两个服务（各开一个终端）：

```bash
# 终端 1：启动后端服务（监听 5201 端口）
npm run dev:server

# 终端 2：启动前端开发服务器（监听 5173 端口）
npm run dev
```

### 4. 访问应用

浏览器打开 `http://localhost:5173` 即可。

> Vite 开发服务器会自动将 `/game` 等 API 请求代理到后端 `http://localhost:5201`。

---

## 二、Docker 部署启动

### 1. 构建并启动

```bash
docker-compose up -d --build
```

### 2. 访问应用

容器启动后，访问 `http://localhost:5201` 即可。

### 3. 常用命令

```bash
# 查看日志
docker-compose logs -f

# 停止
docker-compose down

# 重新构建并启动
docker-compose up -d --build
```

### 4. Docker 构建参数

通过环境变量自定义构建：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PROJECT_NAME` | `who-is-wodi` | 项目名称，影响容器名和路由前缀 |
| `HOST_PORT` | `5201` | 宿主机映射端口 |
| `VITE_BASE_PATH` | `/${PROJECT_NAME}/` | 前端静态资源基础路径 |
| `VITE_APP_KEY` | `${PROJECT_NAME}` | 前端 API 前缀标识 |
| `MYSQL_HOST` | `mysql` | 数据库地址 |
| `NACOS_ENABLED` | `true` | 是否启用 Nacos 服务注册 |

---

## 三、生产构建

如果需要手动构建（不使用 Docker）：

```bash
# 构建前端产物（输出到 dist/ 目录）
npm run build

# 启动后端（后端会同时托管 dist/ 静态文件）
cd server
node index.js
```

构建后，Node.js 后端同时提供：
- 游戏 API（`/game/`）
- 前端静态文件服务
- SPA 路由回退

---

## 四、健康检查

后端启动后可访问健康检查端点：

```bash
curl http://localhost:5201/health
```

返回示例：

```json
{
  "status": "healthy",
  "checks": {
    "server": "ok",
    "nacos": "disabled",
    "uptime": 12.345
  }
}
```

---

## 五、端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Vite 开发服务器 | 5173 | 本地开发前端访问入口 |
| Node.js 后端 | 5201 | API 服务 + 静态文件托管 |
| Docker 映射 | 5201 | 容器对外暴露端口 |
