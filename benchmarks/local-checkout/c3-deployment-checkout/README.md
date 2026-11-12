# C3 · 部署页：运行中的检出与「拉取并构建」

- Ticket: `4b2e5405034cd590e0de80c3f261847a` (alignment `q-3603edff` 的 C3 slice)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/38
- 回归重点：管理路由只 spawn 服务脚本、不重启/不发信号；链匹配看全部 remote；日志写 stateDir 而非检出；单飞在读检出之前占位。
