
---
title: 我的第一篇技术博客：Hexo+Butterfly 搭建与避坑记录
date: 2026-03-26 10:00:00
tags:
  - Hexo
  - 博客搭建
categories:
  - 技术笔记
---
这是我的第一篇技术博客！今天终于把 Hexo 框架和 Butterfly 主题跑通了，看着这满屏的极客风，成就感拉满。

### 1. 核心搭建命令
搭建过程其实不复杂，全局安装加上主题配置，一条长命令就能搞定：
```powershell
npm install -g hexo-cli; hexo init my-blog; cd my-blog; npm install; npm i hexo-theme-butterfly
```

### 2. 今日踩坑记录：YAML 文件的“空格刺客”
在配置主题的 `_config.butterfly.yml` 文件，替换头像和背景图时，遇到了本地服务器直接崩溃拒绝连接的报错（`ERR_CONNECTION_REFUSED`）。

**排错过程：**
* 检查了终端的报错代码，发现卡在 `Hexo.yamlHelper`。
* 猛然醒悟：在 YAML 语法中，**冒号 `:` 后面必须加一个英文空格！**
* 修改前（错误）：`avatar:/img/avatar.png`
* 修改后（正确）：`avatar: /img/avatar.png`

**总结**：敲代码果然容不得半点马虎，一个空格就能引发血案。以后画 PCB 板子、配置嵌入式底层寄存器的时候，也得拿出这种像素级的严谨态度才行！