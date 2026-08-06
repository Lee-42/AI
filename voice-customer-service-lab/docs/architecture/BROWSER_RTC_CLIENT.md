# 浏览器设备管理与 RTC Client Adapter

| 项目 | 当前决策 |
| --- | --- |
| SDK | `@volcengine/rtc@4.68.5`，精确锁定 |
| 媒体 | 仅麦克风音频，不申请摄像头 |
| 授权 | 只在用户点击“检查麦克风”后请求 |
| 入房 | 二次显式点击，不自动连接云端 |
| SDK 加载 | 动态导入，首屏不加载 RTC 大包 |
| 清理 | `stopAudioCapture -> leaveRoom -> destroyEngine` |

## 1. 两步式用户旅程

```text
创建业务 Session
-> 检查麦克风并获得浏览器授权
-> 展示和选择输入设备
-> 用户确认加入 RTC
-> SDK 创建 Engine 并入房
-> 开始音频采集并自动发布
```

授权和入房不能混成页面加载时的副作用：

- 用户还不知道用途时，不应突然弹出系统权限框。
- 授权失败属于设备问题；入房失败属于 Token、网络或 RTC 问题。
- 仅检查设备时不应产生 RTC 使用量。
- 只有用户再次点击“加入 RTC 房间”才连接云端。

浏览器设备 API 需要安全上下文。生产使用 HTTPS，本地开发可以使用
`http://localhost` 或 `http://127.0.0.1`。

## 2. 权限预检为什么马上停止 Track？

`getUserMedia({audio: true})` 用来获得权限和解锁完整设备标签。预检成功后立即对
所有 Track 调用 `stop()`：

```text
请求权限
-> 获得临时 MediaStream
-> 枚举麦克风
-> 立即 stop 临时 Track
```

否则页面只是“检查设备”，浏览器标签页却一直显示正在使用麦克风。真正入房时由
RTC SDK 的 `startAudioCapture(deviceId)` 重新开始采集。

设备 ID 和标签只保存在 React 内存，不进入 Session、日志或本地存储。
`devicechange` 会刷新列表；第 15 节已补充输入设备热切换、掉线回退、基础降噪和
权限异常策略，详见
[`AUDIO_DEVICE_QUALITY_AND_PERMISSIONS.md`](./AUDIO_DEVICE_QUALITY_AND_PERMISSIONS.md)。

## 3. RTC Adapter 做什么？

React 不直接散落调用厂商 SDK。`VolcengineRtcRoomAdapter` 负责：

```text
动态加载 SDK
-> isSupported()
-> createEngine(appId)
-> 绑定连接、Token 和错误回调
-> joinRoom(token, roomId, userId)
-> startAudioCapture(microphoneId)
```

入房配置只启用客服语音需要的能力：

```ts
{
  isAutoPublish: true,
  isAutoSubscribeAudio: true,
  isAutoSubscribeVideo: false
}
```

AppId、RoomId、UserId 和 Token 全部直接来自服务端创建响应。页面不能修改其中
任意一个字段。

## 4. 为什么 SDK 要动态加载？

RTC SDK 的浏览器产物较大。本项目用 `import("@volcengine/rtc")` 将它拆成独立
Chunk：

```text
打开页面 / Mock 操作   不加载 RTC Chunk
点击加入 RTC           才下载并初始化 SDK
```

这不会减少用户真正使用 RTC 时的总下载量，但能保护不使用语音功能的首屏性能。
生产环境还应在真实网络上测量 Chunk 下载、解析和 Engine 初始化耗时。

## 5. 退出为什么需要三步？

```text
stopAudioCapture
  停止使用麦克风

leaveRoom
  停止发布、订阅和房间消息

destroyEngine
  释放 SDK 内存、连接和后台资源
```

只把 React 组件隐藏起来不会释放任何 RTC 资源。当前以下路径都会调用同一套幂等
清理：

- 用户点击“退出 RTC”。
- 用户点击“结束会话”。
- 创建新 Session 前。
- React 组件卸载或页面刷新。
- 入房或采集失败。
- RTC 致命错误。

Adapter 使用操作序号处理取消竞态：如果退出发生在 `joinRoom()` 尚未返回时，
晚到的结果会失效，不能再次启动麦克风。

## 6. 状态与错误边界

设备状态：

```text
idle -> checking -> ready
                   \-> failed
```

RTC 状态：

```text
idle -> joining -> connected -> reconnecting
         |             |            |
         +----------> failed <-------+
connected -> leaving -> idle
```

页面只展示稳定的中文错误，不把 SDK Error 对象、Token 或设备详情发送到日志。
常见分类包括：

- 权限被拒绝。
- 没有麦克风或设备被占用。
- 浏览器不支持。
- Token 过期或 Room/User 不匹配。
- 网络断开与自动重连。

Token 过期前 SDK 会触发 `onTokenWillExpire`。第 14 节已经通过原 Session 幂等键
刷新凭证并调用 `updateToken`，不会重复加入房间。

## 7. 费用与真实性边界

本节实际加入的是火山 RTC 云房间，所以可能产生 RTC 通话使用量，即使房间里没有
AI。`VOLCENGINE_PAID_CALLS_ENABLED=false` 只保护后续服务端
`StartVoiceChat`，不能阻止浏览器使用已经签发的 RTC Token。

因此：

1. 自动化测试只使用 Fake SDK，不加入真实房间。
2. 页面不会自动入房。
3. 第一次人工测试控制在几十秒内。
4. 测试完成立即退出并检查 RTC 用量。
5. 当前 `VOICE_PROVIDER=mock`，所以不会启动 AI Agent 或消耗 AI Tokens。

第 05 节 Mock Provider 返回的 `rtc.join.succeeded` 是模拟事件，不是实际网络
证据。页面新增的 RTC Badge 才来自浏览器 SDK；第 10 节会统一真实事件来源。

## 8. 自动化证据

- 权限预检后临时 Track 必须停止。
- 非安全上下文和拒绝授权映射为稳定错误。
- 入房参数与服务端凭证完全一致。
- 音频自动发布、自动订阅，视频订阅关闭。
- 正常退出严格执行停止采集、离房、销毁。
- 采集失败仍会离房并销毁 Engine。
- 入房中的取消不会晚到后重新启动麦克风。

官方依据：

- [火山引擎：Web RTC 快速开始](https://www.volcengine.com/docs/6348/106914)
- [火山引擎：Web SDK API 详情](https://www.volcengine.com/docs/6348/104478)
- [火山引擎：Web SDK 错误码](https://www.volcengine.com/docs/6348/104480)
- [npm：@volcengine/rtc](https://www.npmjs.com/package/@volcengine/rtc)
