import React from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import GamePage from './pages/GamePage'

/**
 * App 根组件 — 谁是卧底 AI 对战
 *
 * 路由：
 *   /  → GamePage 游戏主页面
 */
const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter basename={`/${__APP_KEY__}`}>
        <Routes>
          <Route path="/" element={<GamePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
