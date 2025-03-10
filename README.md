# Obsidian Sample Plugin

This is a sample plugin for Obsidian (https://obsidian.md).

This project uses TypeScript to provide type checking and documentation.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

This sample plugin demonstrates some of the basic functionality the plugin API can do.
- Adds a ribbon icon, which shows a Notice when clicked.
- Adds a command "Open Sample Modal" which opens a Modal.
- Adds a plugin setting tab to the settings page.
- Registers a global click event and output 'click' to the console.
- Registers a global interval which logs 'setInterval' to the console.

## First time developing plugins?

Quick starting guide for new plugin devs:

- Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)! There might be an existing plugin similar enough that you can partner up with.
- Make a copy of this repo as a template with the "Use this template" button (login to GitHub if you don't see it).
- Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
- Install NodeJS, then run `npm i` in the command line under your repo folder.
- Run `npm run dev` to compile your plugin from `main.ts` to `main.js`.
- Make changes to `main.ts` (or create new `.ts` files). Those changes should be automatically compiled into `main.js`.
- Reload Obsidian to load the new version of your plugin.
- Enable plugin in settings window.
- For updates to the Obsidian API run `npm update` in the command line under your repo folder.

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint (optional)
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code. 
- To use eslint with this project, make sure to install eslint from terminal:
  - `npm install -g eslint`
- To use eslint to analyze this project use this command:
  - `eslint main.ts`
  - eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
  - `eslint .\src\`

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API Documentation

See https://github.com/obsidianmd/obsidian-api

## 重构改进

本次重构主要针对代码结构进行了优化，减少了组件间的耦合度：

1. **服务接口化**
   - 为所有服务定义了接口，使代码更加清晰和可维护
   - 服务之间通过接口而非具体实现进行交互

2. **依赖注入模式**
   - 实现了服务容器（ServiceContainer）进行依赖管理
   - 使用SERVICE_TYPES常量避免字符串硬编码
   - 服务实例通过容器注册和获取，避免直接依赖

3. **功能拆分**
   - 将定时器管理功能抽象为独立的TimerService服务
   - 每个服务只负责单一职责，符合单一职责原则

4. **资源管理优化**
   - 提供了统一的资源释放机制
   - 服务容器按照依赖顺序管理资源释放，确保安全

这些改进使得代码更加模块化，便于扩展和测试，同时保持了原有功能和性能。

## 性能优化

### 文件名缓存持久化

为了提高用户体验，插件现在支持文件名缓存持久化功能。这意味着当您重新启动 Obsidian 时，不会再看到从原始文件名到显示文件名的刷新过程，而是能够立即显示缓存的文件名。

具体优化包括：

1. **持久化缓存**：将文件名缓存保存到 Obsidian 数据存储中，在会话之间保持
2. **快速启动渲染**：启动时从缓存中立即加载文件名，避免闪烁体验
3. **智能缓存管理**：自动清理过期和无用的缓存条目，保持性能
4. **优先处理可见文件**：先处理用户当前可见的文件，然后再处理后台文件

这些优化显著提高了插件的响应速度和用户体验，特别是对于大型知识库。

### 缓存一致性保障

插件现在实现了强大的缓存一致性机制，确保即使在文件内容变更时也能正确显示文件名：

1. **文件修改时间跟踪**：记录每个文件的最后修改时间，当文件被修改时自动检测
2. **实时事件监听**：监听 Obsidian 文件修改事件，立即刷新受影响文件的缓存
3. **缓存验证机制**：在使用缓存前自动验证其一致性，确保不会显示过时的文件名
4. **文件重命名处理**：正确处理文件重命名事件，保持缓存与文件系统同步

这些机制共同确保了文件名显示始终与文件内容保持一致，无论是手动编辑、外部修改还是通过其他插件更改。
