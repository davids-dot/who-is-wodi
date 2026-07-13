# Vendored Dependencies

本目录包含从外部 npm 包中提取的 vendored 依赖，用于在盒子内网环境中避免 npm install 时无法访问外部 registry 的问题。

## 目录结构

```
vendor/
├── nacos-common/     # Nacos 通用 gRPC 通信库
│   ├── lib/
│   │   ├── grpc/     # gRPC 连接、传输、编解码
│   │   └── *.js      # 接口定义和工具函数
│   ├── proto/         # Protobuf 协议定义
│   └── package.json
├── nacos-naming/     # Nacos 服务发现命名库
│   ├── lib/
│   │   ├── naming/   # 服务注册、心跳、实例管理
│   │   └── *.js      # 阿里云鉴权、常量、工具函数
│   └── package.json
└── README.md         # 本文件
```

## 来源

- `nacos-common`: 提取自 `nacos-sdk-nodejs` 仓库，版本约 2.x
- `nacos-naming`: 提取自 `nacos-sdk-nodejs` 仓库，版本约 2.x

## 用途

- `nacos-common`: 提供 gRPC 传输层（连接管理、payload 编解码、transport client）
- `nacos-naming`: 提供服务注册与发现能力（beat reactor、host reactor、grpc proxy、push receiver）

## 更新方法

1. 从 [nacos-sdk-nodejs](https://github.com/nacos-group/nacos-sdk-nodejs) 获取最新版本
2. 提取 `nacos-common` 和 `nacos-naming` 的编译产物（`lib/` 目录）
3. 保留 `proto/` 协议定义文件
4. 更新对应 `package.json` 中的版本号
5. 测试 Nacos 服务注册功能正常工作

## 注意事项

- 不要手动修改 vendored 文件，除非有明确的 bug fix
- 更新后需在盒子环境中完整测试 Nacos 注册/注销/心跳功能
- `nacos.js`（在 `server/` 目录中）依赖这两个 vendored 包
