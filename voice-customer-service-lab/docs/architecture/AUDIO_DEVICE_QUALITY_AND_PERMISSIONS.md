# 音频设备切换、基础降噪与权限异常

本节把麦克风视为会变化、会失效的运行时资源，而不是页面启动时读取一次的固定配置。

## 1. 处理链路

```text
用户授权
  -> 浏览器枚举 audioinput
  -> 选择麦克风
  -> 入房前设置语音采集参数
  -> RTC 采集并上报本地音量
  -> devicechange / SDK 设备事件持续校验
```

设备 ID 和标签只保留在页面内存，不进入 Session、日志或本地存储。音量面板只接收
`0..255` 的聚合值，不读取、录制或上传原始 PCM。

## 2. 通话中如何切换麦克风

人工切换调用 `setAudioCaptureDevice(deviceId)`，不离房、不重建 Session，也不重启
Agent。UI 在 SDK Promise 完成前显示“正在切换”：

- 成功：提交新选择，并告知当前设备。
- 失败：如果旧设备仍存在，则回滚旧选择。
- 旧设备被拔出：选择设备列表中的第一个确定性备用设备并立即切换。
- 没有备用设备或备用切换失败：Stop Agent，再 Leave RTC，防止无上行音频时继续占用资源。

浏览器的 `devicechange` 兼容性并不完全一致，因此真实 RTC 还同时监听 SDK 的
`onAudioDeviceStateChanged` 和 `onTrackEnded`。任意一路只负责触发同一套恢复策略，
不能各自创建新的连接。

## 3. “降噪”不是一个模糊开关

本项目提供两种基础采集模式，且必须在首次采集和发布前配置：

| 模式 | echoCancellation | noiseSuppression | autoGainControl | 用途 |
| --- | --- | --- | --- | --- |
| 客服语音优化 | 开 | 开 | 开 | 默认客服通话，抑制回声和持续背景噪声 |
| 原始音频 | 关 | 关 | 关 | 仅用于受控排障和 A/B 对照 |

这是浏览器/WebRTC 的基础语音处理，适合风扇、空调等相对平稳的噪声。键盘敲击、
碰撞声和背景人声属于非平稳噪声，不能假定基础处理一定能消除。

火山 Web SDK 另有 AI 音频降噪插件，可在通话中启停并处理更多非平稳噪声。本课程
暂不接入，因为它会增加包体、CPU/内存消耗和设备兼容性矩阵。企业接入前应先采集
真实噪声样本，以 ASR 字错率、用户投诉率和端侧负载为依据，而不是因为“AI”字样
默认开启。

## 4. 权限异常如何分类

| 现象 | 稳定错误 | 用户动作 |
| --- | --- | --- |
| 非 HTTPS/localhost | `INSECURE_CONTEXT` | 改用 HTTPS 或 localhost |
| 页面策略禁止麦克风 | `PERMISSION_POLICY_BLOCKED` | 修正 `Permissions-Policy` 或 iframe `allow` |
| 用户或系统拒绝 | `PERMISSION_DENIED` | 检查地址栏网站设置和系统隐私设置 |
| 没有设备 | `NO_MICROPHONE` | 连接麦克风后重新检查 |
| 设备占用/驱动读取失败 | `MICROPHONE_BUSY` | 关闭占用应用或重插设备 |
| 其他采集异常 | `DEVICE_ERROR` | 更新浏览器、检查驱动后重试 |

浏览器通常不会可靠区分“网站拒绝”和“操作系统隐私设置拒绝”，所以 UI 不伪造精确
结论，而是给出两处设置的共同排障路径。`Permissions API` 查询失败也不会阻止显式的
`getUserMedia` 授权流程。

## 5. 音量面板能证明什么

RTC 每 500ms 上报一次本地线性音量：

- `0..25`：近似无声；
- `26..75`：偏低；
- `76..204`：正常；
- `205..255`：过高，可能削波。

它只能说明“本地采集有多少能量”，不能证明说话人是谁、ASR 是否识别正确，也不能
作为提交对话轮次的依据。VAD、ASR 和业务判停仍由第 12 节定义的权威事件负责。

## 6. 零费用练习

默认 `RTC_TOKEN_PROVIDER=mock` 时，可以验证授权、设备枚举、模式选择和权限错误；
不会加入云房间，因此音量面板保持“入房后显示”。如需验证真实热切换和音量：

1. 明确切换为真实 RTC Token，并确认费用保护。
2. 选择“客服语音优化”，加入房间后观察本地音量。
3. 接入第二个麦克风，在通话中切换，确认不重建 Session/Agent。
4. 拔出当前设备，确认自动选择备用设备。
5. 拔出所有麦克风，确认系统停止 Agent 并退出 RTC。
6. 测试完成立即结束 Session，并检查控制台用量。

不要通过录制真实客户音频做开发验证；使用测试语料和测试账号。

## 7. 自动化证据

- 设备保留、确定性回退和无设备状态有纯函数测试。
- Permission Policy、已有权限和设备枚举失败有稳定映射测试。
- 推荐/原始采集参数均在 `startAudioCapture` 前设置。
- RTC 音量和设备状态只传递结构化诊断值。
- 切换失败映射为稳定错误，不泄露 SDK Error。
- 所有测试使用 Fake SDK，不加入真实房间。

官方依据：

- [火山引擎：Web 端音频降噪](https://www.volcengine.com/docs/6348/148647)
- [火山引擎：Web SDK API 详情](https://www.volcengine.com/docs/6348/104478)
- [MDN：enumerateDevices](https://developer.mozilla.org/docs/Web/API/MediaDevices/enumerateDevices)
- [MDN：devicechange](https://developer.mozilla.org/docs/Web/API/MediaDevices/devicechange_event)
- [MDN：getUserMedia 的隐私与安全边界](https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia)
