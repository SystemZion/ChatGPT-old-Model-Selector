# ChatGPT Classic Model Selector

一个 Tampermonkey 用户脚本，为 ChatGPT 网页版恢复经典的左上角模型选择器界面。

![Demo](https://img.shields.io/badge/Tampermonkey-UserScript-green) ![Version](https://img.shields.io/badge/version-9.2.0-blue) ![License](https://img.shields.io/badge/license-MIT-brightgreen)

## 为什么做这个？

ChatGPT 把模型选择入口藏到了底部输入框右侧的一个小按钮里（"深入▾"），切换模型需要多次点击，而且不直观。

这个脚本在页面左上角恢复了类似旧版 ChatGPT 的模型选择框：一键查看所有可用模型，快速切换。

## 功能

- **左上角经典选择器** — 显示当前模型名称（如 `ChatGPT 5.5 Thinking`），点击展开模型菜单
- **自动适配侧边栏** — 侧边栏展开/收起时，选择器位置自动调整
- **主菜单** — 显示当前版本的所有模式（Auto / Thinking / Pro）
- **传统模型子菜单** — 鼠标悬停「传统模型」展开子菜单，显示所有旧版本模型（如 GPT-5.4 Thinking、GPT-5.3 Pro、o3 等）
- **真实切换** — 通过操作官方菜单完成模型切换，不破解权限、不绕过限制
- **动态读取** — 不硬编码模型名称，从官方菜单实时读取可用模型列表
- **深色模式** — 自动跟随 ChatGPT 的主题设置
- **Shadow DOM 隔离** — 脚本样式不会污染 ChatGPT 页面
- **错误保护** — 所有操作 try/catch 包裹，出错时 toast 提示，不影响正常聊天

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击下方链接安装脚本（或手动新建脚本粘贴代码）：

   **[安装脚本](chatgpt-classic-model-selector.user.js)**

3. 访问 [chatgpt.com](https://chatgpt.com)，左上角会出现模型选择器

## 使用方法

| 操作 | 效果 |
|------|------|
| 点击 `ChatGPT 5.5 ∨` | 打开模型菜单 |
| 点击菜单中的模型 | 切换到该模型 |
| 悬停「传统模型」 | 展开旧版本子菜单 |
| 点击页面其他区域 | 关闭菜单 |

### 按钮显示规则

| 实际模型 | 按钮显示 |
|---------|---------|
| 5.5 Instant（默认） | `ChatGPT 5.5` |
| 5.5 Thinking | `ChatGPT 5.5 Thinking` |
| 5.5 Pro | `ChatGPT 5.5 Pro` |
| GPT-5.3 Thinking | `ChatGPT 5.3 Thinking` |
| o3 | `ChatGPT o3` |

## 工作原理

脚本**不修改** ChatGPT 的任何内部状态或 API 调用。所有模型切换都通过模拟用户点击官方界面元素完成：

1. **点击旧版按钮时**，临时打开底部的官方模型菜单（`__composer-pill` 按钮）
2. **读取菜单内容**，获取当前版本号和可用模式
3. **展开「配置…」面板**，遍历版本下拉框读取所有旧版本及其模式
4. **用读取到的真实数据**渲染旧版风格菜单
5. **用户选择模型时**，重新打开官方菜单并点击对应项完成切换

### 不做什么

- ❌ 不破解模型权限 — 只能选择账号已有权限的模型
- ❌ 不硬编码模型列表 — 模型名称从官方菜单动态读取
- ❌ 不持续扫描 DOM — 所有读取只在用户点击时触发
- ❌ 不修改 React 状态 — 不删除/隐藏原始按钮的 DOM 节点
- ❌ 不发送任何网络请求 — 纯前端 DOM 操作

## 兼容性

- **浏览器**：Chrome / Edge / Firefox / Safari（需 Tampermonkey）
- **网址**：`chatgpt.com` 和 `chat.openai.com`
- **账号**：Free / Plus / Pro 均可（显示的模型取决于账号权限）

## 已知限制

- 首次点击选择器时需要 2-3 秒加载传统模型列表（后续使用会话内缓存）
- 如果 ChatGPT 更改了 DOM 结构（class 名、菜单布局），脚本可能需要更新
- 传统模型子菜单的 Instant 模式显示为版本号（如 `GPT-5.4`），不带 "Instant" 后缀

## 开发

```bash
# 克隆仓库
git clone https://github.com/your-username/chatgpt-classic-model-selector.git

# 脚本是单文件，直接编辑即可
# chatgpt-classic-model-selector.user.js
```

### 技术要点

- Shadow DOM 隔离样式
- Snapshot 对比法检测弹出菜单（点击前拍快照，点击后找新元素）
- 完整事件模拟链：`pointerdown → mousedown → pointerup → mouseup → click`
- MutationObserver 监听侧边栏和主题变化（仅监听 `<html>` 和 `<nav>` 元素属性）

## 许可证

[MIT License](LICENSE)

## 免责声明

本脚本不包含 OpenAI 的商标、图标或代码。"ChatGPT" 名称仅用于描述兼容性。脚本通过模拟用户点击操作官方界面，不绕过任何安全限制或访问控制。使用风险自负。
