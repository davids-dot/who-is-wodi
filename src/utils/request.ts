/**
 * Fetch 请求封装 — 网关路由架构
 *
 * 盒子模式：
 *   /api/<appKey>/xxx → 网关去掉 /api → /<appKey>/xxx → Node.js 服务
 * 公网模式：
 *   /xxx → 同源直接访问 Node.js 服务（无网关）
 */

/** API 基础路径：盒子模式 /api/<appKey>，公网模式空字符串 */
const API_BASE = __APP_KEY__ ? `/api/${__APP_KEY__}` : ''

/**
 * 从 localStorage 获取 NS-TOKEN，构建鉴权请求头
 * 所有 /api 请求自动携带，后端可通过此 token 进行用户身份识别
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('NS-TOKEN')
  if (token) {
    headers['NS-TOKEN'] = token
  }
  return headers
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: unknown
}

interface ApiResponse<T = unknown> {
  data: T
  count?: number
  error?: string
}

export async function request<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', headers = {}, body } = options

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()
  if (data.error) {
    throw new Error(data.error)
  }
  return data as ApiResponse<T>
}

/**
 * 执行数据库查询 (通过 Node.js 中间层)
 * 请求路径: /api/<appKey>/db/query
 */
export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<{ data: T[]; count: number }> {
  const res = await request<T[]>('/db/query', {
    method: 'POST',
    body: { sql, params },
  })
  return { data: res.data, count: res.count ?? 0 }
}

/**
 * 检查数据库连接健康状态
 * 请求路径: /api/<appKey>/db/query/health
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/db/query/health`, {
      headers: { ...getAuthHeaders() },
    })
    const data = await res.json()
    return data.status === 'ok'
  } catch {
    return false
  }
}

export { API_BASE, getAuthHeaders }

/**
 * requestInstance - 兼容 ChatPage 的 request 实例
 * 提供 get 方法用于获取数据
 */
export const requestInstance = {
  async get<T = unknown>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url, { method: 'GET' })
  },
  async post<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>(url, { method: 'POST', body })
  },
}
