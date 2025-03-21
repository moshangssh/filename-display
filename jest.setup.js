// 模拟Obsidian API
global.window = global;

// 模拟Obsidian的基础类和方法
global.App = class App {};
global.Plugin = class Plugin {};
global.PluginSettingTab = class PluginSettingTab {};
global.Setting = class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addDropdown() { return this; }
  addSlider() { return this; }
  addButton() { return this; }
};

// 模拟DOM元素
global.HTMLElement = class HTMLElement {};
global.WeakMap = global.WeakMap || class WeakMap {};

// 模拟localStorage
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

// 模拟console方法
global.console = {
  ...global.console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}; 