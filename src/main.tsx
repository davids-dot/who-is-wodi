import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.less'

// React 18 StrictMode 会双重调用 useEffect
// 数据请求必须使用 useRef 防止重复请求：
//   const fetchedRef = useRef(false)
//   useEffect(() => {
//     if (!fetchedRef.current) {
//       fetchedRef.current = true
//       fetchData()
//     }
//   }, [])
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
