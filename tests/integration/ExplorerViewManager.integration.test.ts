import { ExplorerViewManager } from '../../src/services/ExplorerViewManager';
import { ServiceContainer } from '../../src/core/ServiceContainer';
import { ITitleExtractorPlugin } from '../../src/types';
import { IFilenameParser } from '../../src/services/interfaces/IServices';
import { IFileDisplayCache } from '../../src/services/cache/interfaces/IFileDisplayCache';
import { ILoggerService } from '../../src/services/interfaces/IServices';
import { TFile } from 'obsidian';
import { EventBus } from '../../src/core/events/EventBus';

describe('ExplorerViewManager Integration Tests', () => {
    let explorerViewManager: ExplorerViewManager;
    let plugin: ITitleExtractorPlugin;
    let filenameParser: IFilenameParser;
    let fileDisplayCache: IFileDisplayCache;
    let loggerService: ILoggerService;
    let eventBus: EventBus;
    let mockFileExplorer: HTMLElement;

    beforeAll(() => {
        // 初始化事件总线
        eventBus = EventBus.getInstance();
    });

    beforeEach(() => {
        // 创建真实的服务实例
        // 注意：这里我们使用真实的服务实例而不是mock
        const container = ServiceContainer.getInstance();
        filenameParser = container.get<IFilenameParser>('filenameParser');
        fileDisplayCache = container.get<IFileDisplayCache>('fileDisplayCache');
        loggerService = container.get<ILoggerService>('loggerService');

        // 创建模拟的文件浏览器元素
        mockFileExplorer = document.createElement('div');
        mockFileExplorer.className = 'nav-files-container';
        document.body.appendChild(mockFileExplorer);

        // 创建插件实例
        plugin = {
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(),
                    getAllLoadedFiles: jest.fn().mockReturnValue([])
                }
            }
        } as unknown as ITitleExtractorPlugin;

        // 创建ExplorerViewManager实例
        explorerViewManager = new ExplorerViewManager(
            plugin,
            filenameParser,
            fileDisplayCache,
            loggerService
        );
    });

    afterEach(() => {
        // 清理DOM
        document.body.removeChild(mockFileExplorer);
        // 清理事件监听器
        eventBus.clearAll();
        // 清理服务
        explorerViewManager.dispose();
    });

    describe('文件系统事件集成', () => {
        let testFile: TFile;

        beforeEach(() => {
            // 创建测试文件
            testFile = {
                path: 'test.md',
                name: 'test.md',
                stat: {
                    mtime: Date.now()
                }
            } as TFile;

            // 创建文件元素
            const fileEl = document.createElement('div');
            fileEl.className = 'nav-file-title';
            fileEl.setAttribute('data-path', testFile.path);
            mockFileExplorer.appendChild(fileEl);

            // 设置文件系统
            (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
                if (path === testFile.path) return testFile;
                if (path === '/') return { children: [testFile] };
                return null;
            });
        });

        it('应该响应文件重命名事件', async () => {
            // 设置视图
            explorerViewManager.setupView();

            // 触发重命名事件
            const newPath = 'renamed.md';
            testFile.path = newPath;
            eventBus.publish('file:rename', testFile);

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证视图更新
            const fileEl = mockFileExplorer.querySelector(`[data-path="${newPath}"]`);
            expect(fileEl).toBeTruthy();
        });

        it('应该响应文件修改事件', async () => {
            // 设置视图
            explorerViewManager.setupView();

            // 触发修改事件
            eventBus.publish('file:modify', testFile);

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证缓存更新
            expect(fileDisplayCache.get(testFile.path)).toBeTruthy();
        });

        it('应该响应文件删除事件', async () => {
            // 设置视图
            explorerViewManager.setupView();

            // 触发删除事件
            eventBus.publish('file:delete', testFile.path);

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证元素移除
            const fileEl = mockFileExplorer.querySelector(`[data-path="${testFile.path}"]`);
            expect(fileEl).toBeFalsy();
        });
    });

    describe('DOM事件集成', () => {
        let testFolder: HTMLElement;
        let testFile: TFile;

        beforeEach(() => {
            // 创建测试文件夹结构
            testFolder = document.createElement('div');
            testFolder.className = 'nav-folder';
            testFolder.setAttribute('data-path', 'test-folder');

            // 创建测试文件
            testFile = {
                path: 'test-folder/test.md',
                name: 'test.md',
                stat: {
                    mtime: Date.now()
                }
            } as TFile;

            // 创建文件元素
            const fileEl = document.createElement('div');
            fileEl.className = 'nav-file-title';
            fileEl.setAttribute('data-path', testFile.path);
            testFolder.appendChild(fileEl);

            mockFileExplorer.appendChild(testFolder);

            // 设置文件系统
            (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
                if (path === testFile.path) return testFile;
                if (path === '/') return { children: [{ path: 'test-folder', children: [testFile] }] };
                return null;
            });
        });

        it('应该响应文件夹展开事件', async () => {
            // 设置视图
            explorerViewManager.setupView();

            // 触发文件夹展开事件
            testFolder.dispatchEvent(new CustomEvent('click'));

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证文件处理
            expect(fileDisplayCache.get(testFile.path)).toBeTruthy();
        });

        it('应该响应DOM变化', async () => {
            // 设置视图
            explorerViewManager.setupView();

            // 添加新文件元素
            const newFile = {
                path: 'test-folder/new.md',
                name: 'new.md'
            } as TFile;

            const newFileEl = document.createElement('div');
            newFileEl.className = 'nav-file-title';
            newFileEl.setAttribute('data-path', newFile.path);
            testFolder.appendChild(newFileEl);

            // 等待MutationObserver处理
            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证新元素处理
            expect(fileDisplayCache.get(newFile.path)).toBeTruthy();
        });
    });

    describe('缓存集成', () => {
        let testFile: TFile;

        beforeEach(() => {
            // 创建测试文件
            testFile = {
                path: 'test.md',
                name: 'test.md',
                stat: {
                    mtime: Date.now()
                }
            } as TFile;

            // 创建文件元素
            const fileEl = document.createElement('div');
            fileEl.className = 'nav-file-title';
            fileEl.setAttribute('data-path', testFile.path);
            mockFileExplorer.appendChild(fileEl);

            // 设置文件系统
            (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
                if (path === testFile.path) return testFile;
                if (path === '/') return { children: [testFile] };
                return null;
            });
        });

        it('应该正确使用缓存系统', async () => {
            // 设置视图
            explorerViewManager.setupView();

            // 首次处理文件
            await explorerViewManager.updateFileItem(testFile);

            // 验证缓存设置
            const cachedResult = fileDisplayCache.get(testFile.path);
            expect(cachedResult).toBeTruthy();
            expect(cachedResult?.fromCache).toBe(true);

            // 修改文件
            testFile.stat.mtime = Date.now();
            await explorerViewManager.updateFileItem(testFile);

            // 验证缓存更新
            const updatedResult = fileDisplayCache.get(testFile.path);
            expect(updatedResult).toBeTruthy();
            expect(updatedResult?.fromCache).toBe(true);
        });

        it('应该正确处理缓存失效', async () => {
            // 设置视图
            explorerViewManager.setupView();

            // 首次处理文件
            await explorerViewManager.updateFileItem(testFile);

            // 清除缓存
            fileDisplayCache.clear();

            // 再次处理文件
            await explorerViewManager.updateFileItem(testFile);

            // 验证重新处理
            const result = fileDisplayCache.get(testFile.path);
            expect(result).toBeTruthy();
            expect(result?.fromCache).toBe(true);
        });
    });

    describe('复杂场景集成测试', () => {
        describe('大规模文件操作', () => {
            let testFiles: TFile[];
            const FILE_COUNT = 100;

            beforeEach(() => {
                // 创建大量测试文件
                testFiles = Array.from({ length: FILE_COUNT }, (_, i) => ({
                    path: `test${i}.md`,
                    name: `test${i}.md`,
                    stat: { mtime: Date.now() }
                } as TFile));

                // 创建文件元素
                testFiles.forEach(file => {
                    const fileEl = document.createElement('div');
                    fileEl.className = 'nav-file-title';
                    fileEl.setAttribute('data-path', file.path);
                    mockFileExplorer.appendChild(fileEl);
                });

                // 设置文件系统
                (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
                    if (path === '/') return { children: testFiles };
                    return testFiles.find(f => f.path === path) || null;
                });
            });

            it('应该能处理大量文件的批量重命名', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 批量重命名文件
                const renamePromises = testFiles.map(async (file, index) => {
                    const newPath = `renamed${index}.md`;
                    file.path = newPath;
                    eventBus.publish('file:rename', file);
                });

                // 等待所有重命名操作完成
                await Promise.all(renamePromises);
                await new Promise(resolve => setTimeout(resolve, 500));

                // 验证所有文件都被正确重命名
                testFiles.forEach((file, index) => {
                    const fileEl = mockFileExplorer.querySelector(`[data-path="renamed${index}.md"]`);
                    expect(fileEl).toBeTruthy();
                });
            });

            it('应该能处理大量文件的并发更新', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 并发更新所有文件
                const updatePromises = testFiles.map(async file => {
                    file.stat.mtime = Date.now();
                    eventBus.publish('file:modify', file);
                });

                // 等待所有更新操作完成
                await Promise.all(updatePromises);
                await new Promise(resolve => setTimeout(resolve, 500));

                // 验证所有文件都被更新
                testFiles.forEach(file => {
                    expect(fileDisplayCache.get(file.path)).toBeTruthy();
                });
            });
        });

        describe('复杂文件夹结构', () => {
            let rootFolder: HTMLElement;
            let testFiles: TFile[];
            let folderStructure: Map<string, HTMLElement>;

            beforeEach(() => {
                folderStructure = new Map();
                testFiles = [];

                // 创建复杂的文件夹结构
                rootFolder = document.createElement('div');
                rootFolder.className = 'nav-folder';
                rootFolder.setAttribute('data-path', '/');
                mockFileExplorer.appendChild(rootFolder);

                // 创建3层深度的文件夹结构
                for (let i = 1; i <= 3; i++) {
                    const folderPath = `folder${i}`;
                    const folder = createFolder(folderPath);
                    
                    // 在每个文件夹中创建文件和子文件夹
                    for (let j = 1; j <= 3; j++) {
                        const subFolderPath = `${folderPath}/subfolder${j}`;
                        const subFolder = createFolder(subFolderPath);
                        folder.appendChild(subFolder);

                        // 在子文件夹中创建文件
                        for (let k = 1; k <= 3; k++) {
                            const filePath = `${subFolderPath}/test${k}.md`;
                            const file = {
                                path: filePath,
                                name: `test${k}.md`,
                                stat: { mtime: Date.now() }
                            } as TFile;
                            testFiles.push(file);

                            const fileEl = document.createElement('div');
                            fileEl.className = 'nav-file-title';
                            fileEl.setAttribute('data-path', filePath);
                            subFolder.appendChild(fileEl);
                        }
                    }

                    rootFolder.appendChild(folder);
                }

                // 设置文件系统
                (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
                    if (path === '/') return { children: Array.from(folderStructure.keys()).map(p => ({ path: p })) };
                    return testFiles.find(f => f.path === path) || null;
                });
            });

            function createFolder(path: string): HTMLElement {
                const folder = document.createElement('div');
                folder.className = 'nav-folder';
                folder.setAttribute('data-path', path);
                folderStructure.set(path, folder);
                return folder;
            }

            it('应该正确处理嵌套文件夹的展开/折叠', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 递归展开所有文件夹
                for (const folder of folderStructure.values()) {
                    folder.dispatchEvent(new CustomEvent('click'));
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // 验证所有文件都被处理
                testFiles.forEach(file => {
                    expect(fileDisplayCache.get(file.path)).toBeTruthy();
                });
            });

            it('应该正确处理深层文件夹的重命名', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 重命名深层文件夹
                const targetFolder = 'folder2/subfolder2';
                const newFolderPath = 'folder2/renamed_subfolder';

                // 更新所有相关文件的路径
                testFiles.forEach(file => {
                    if (file.path.startsWith(targetFolder)) {
                        const newPath = file.path.replace(targetFolder, newFolderPath);
                        file.path = newPath;
                        eventBus.publish('file:rename', file);
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 500));

                // 验证所有相关文件都被正确重命名
                testFiles.forEach(file => {
                    if (file.path.includes(newFolderPath)) {
                        const fileEl = mockFileExplorer.querySelector(`[data-path="${file.path}"]`);
                        expect(fileEl).toBeTruthy();
                    }
                });
            });
        });

        describe('混合操作场景', () => {
            let testFiles: TFile[];

            beforeEach(() => {
                testFiles = [
                    { path: 'test1.md', name: 'test1.md', stat: { mtime: Date.now() } },
                    { path: 'test2.md', name: 'test2.md', stat: { mtime: Date.now() } },
                    { path: 'test3.md', name: 'test3.md', stat: { mtime: Date.now() } }
                ] as TFile[];

                // 创建文件元素
                testFiles.forEach(file => {
                    const fileEl = document.createElement('div');
                    fileEl.className = 'nav-file-title';
                    fileEl.setAttribute('data-path', file.path);
                    mockFileExplorer.appendChild(fileEl);
                });

                // 设置文件系统
                (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
                    if (path === '/') return { children: testFiles };
                    return testFiles.find(f => f.path === path) || null;
                });
            });

            it('应该正确处理同时发生的多种操作', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 同时执行多种操作
                const operations = [
                    // 重命名第一个文件
                    async () => {
                        const file = testFiles[0];
                        file.path = 'renamed1.md';
                        eventBus.publish('file:rename', file);
                    },
                    // 修改第二个文件
                    async () => {
                        const file = testFiles[1];
                        file.stat.mtime = Date.now();
                        eventBus.publish('file:modify', file);
                    },
                    // 删除第三个文件
                    async () => {
                        const file = testFiles[2];
                        eventBus.publish('file:delete', file.path);
                    }
                ];

                // 并发执行所有操作
                await Promise.all(operations.map(op => op()));
                await new Promise(resolve => setTimeout(resolve, 500));

                // 验证所有操作的结果
                expect(mockFileExplorer.querySelector('[data-path="renamed1.md"]')).toBeTruthy();
                expect(fileDisplayCache.get(testFiles[1].path)).toBeTruthy();
                expect(mockFileExplorer.querySelector(`[data-path="${testFiles[2].path}"]`)).toBeFalsy();
            });

            it('应该正确处理快速连续的操作', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 对同一个文件快速执行多个操作
                const file = testFiles[0];
                const operations = [
                    async () => {
                        file.path = 'temp1.md';
                        eventBus.publish('file:rename', file);
                    },
                    async () => {
                        file.stat.mtime = Date.now();
                        eventBus.publish('file:modify', file);
                    },
                    async () => {
                        file.path = 'temp2.md';
                        eventBus.publish('file:rename', file);
                    },
                    async () => {
                        file.path = 'final.md';
                        eventBus.publish('file:rename', file);
                    }
                ];

                // 快速连续执行操作
                for (const op of operations) {
                    await op();
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                await new Promise(resolve => setTimeout(resolve, 500));

                // 验证最终状态
                expect(mockFileExplorer.querySelector('[data-path="final.md"]')).toBeTruthy();
                expect(fileDisplayCache.get('final.md')).toBeTruthy();
            });
        });
    });

    describe('边界条件和错误处理', () => {
        describe('特殊字符文件名处理', () => {
            let specialFiles: TFile[];

            beforeEach(() => {
                // 创建包含特殊字符的文件
                specialFiles = [
                    { path: 'test with spaces.md', name: 'test with spaces.md' },
                    { path: 'test#special#chars.md', name: 'test#special#chars.md' },
                    { path: 'test[brackets].md', name: 'test[brackets].md' },
                    { path: 'test{curly}braces.md', name: 'test{curly}braces.md' },
                    { path: 'test@symbol.md', name: 'test@symbol.md' },
                    { path: 'test&ampersand.md', name: 'test&ampersand.md' },
                    { path: 'test%percent.md', name: 'test%percent.md' },
                    { path: 'test+plus.md', name: 'test+plus.md' },
                    { path: 'test=equals.md', name: 'test=equals.md' },
                    { path: 'test$dollar.md', name: 'test$dollar.md' }
                ] as TFile[];

                // 为每个文件创建DOM元素
                specialFiles.forEach(file => {
                    const fileEl = document.createElement('div');
                    fileEl.className = 'nav-file-title';
                    fileEl.setAttribute('data-path', file.path);
                    mockFileExplorer.appendChild(fileEl);
                });

                // 设置文件系统
                (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation((path: string) => {
                    if (path === '/') return { children: specialFiles };
                    return specialFiles.find(f => f.path === path) || null;
                });
            });

            it('应该正确处理包含特殊字符的文件名', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 处理所有文件
                await Promise.all(specialFiles.map(file => explorerViewManager.updateFileItem(file)));

                // 验证所有文件都被正确处理
                specialFiles.forEach(file => {
                    expect(fileDisplayCache.get(file.path)).toBeTruthy();
                    const fileEl = mockFileExplorer.querySelector(`[data-path="${file.path}"]`);
                    expect(fileEl).toBeTruthy();
                });
            });

            it('应该正确处理特殊字符文件的重命名', async () => {
                // 设置视图
                explorerViewManager.setupView();

                // 重命名包含特殊字符的文件
                const file = specialFiles[0];
                const newPath = 'renamed with @#$%.md';
                file.path = newPath;
                eventBus.publish('file:rename', file);

                await new Promise(resolve => setTimeout(resolve, 200));

                // 验证重命名结果
                const fileEl = mockFileExplorer.querySelector(`[data-path="${newPath}"]`);
                expect(fileEl).toBeTruthy();
                expect(fileDisplayCache.get(newPath)).toBeTruthy();
            });
        });

        describe('极限条件处理', () => {
            it('应该处理超长文件名', async () => {
                // 创建超长文件名
                const longName = 'a'.repeat(255) + '.md';
                const longFile = {
                    path: longName,
                    name: longName,
                    stat: { mtime: Date.now() }
                } as TFile;

                // 创建文件元素
                const fileEl = document.createElement('div');
                fileEl.className = 'nav-file-title';
                fileEl.setAttribute('data-path', longFile.path);
                mockFileExplorer.appendChild(fileEl);

                // 设置视图并处理文件
                explorerViewManager.setupView();
                await explorerViewManager.updateFileItem(longFile);

                // 验证处理结果
                expect(fileDisplayCache.get(longFile.path)).toBeTruthy();
            });

            it('应该处理空文件夹', async () => {
                // 创建空文件夹
                const emptyFolder = document.createElement('div');
                emptyFolder.className = 'nav-folder';
                emptyFolder.setAttribute('data-path', 'empty-folder');
                mockFileExplorer.appendChild(emptyFolder);

                // 设置视图
                explorerViewManager.setupView();

                // 触发文件夹展开事件
                emptyFolder.dispatchEvent(new CustomEvent('click'));

                await new Promise(resolve => setTimeout(resolve, 200));

                // 验证空文件夹处理
                expect(emptyFolder.getAttribute('data-processed')).toBeTruthy();
            });

            it('应该处理深层嵌套文件夹', async () => {
                // 创建深层嵌套结构
                let currentFolder = mockFileExplorer;
                const DEPTH = 10;
                const folders: HTMLElement[] = [];

                for (let i = 1; i <= DEPTH; i++) {
                    const folder = document.createElement('div');
                    folder.className = 'nav-folder';
                    folder.setAttribute('data-path', `folder${i}`);
                    currentFolder.appendChild(folder);
                    folders.push(folder);
                    currentFolder = folder;
                }

                // 在最深层添加文件
                const deepFile = {
                    path: `folder${DEPTH}/deep.md`,
                    name: 'deep.md',
                    stat: { mtime: Date.now() }
                } as TFile;

                const fileEl = document.createElement('div');
                fileEl.className = 'nav-file-title';
                fileEl.setAttribute('data-path', deepFile.path);
                currentFolder.appendChild(fileEl);

                // 设置视图
                explorerViewManager.setupView();

                // 递归展开所有文件夹
                for (const folder of folders) {
                    folder.dispatchEvent(new CustomEvent('click'));
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // 验证深层文件处理
                expect(fileDisplayCache.get(deepFile.path)).toBeTruthy();
            });
        });

        describe('错误处理', () => {
            it('应该优雅处理文件系统错误', async () => {
                // 模拟文件系统错误
                (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockImplementation(() => {
                    throw new Error('文件系统错误');
                });

                const testFile = {
                    path: 'error.md',
                    name: 'error.md'
                } as TFile;

                // 创建文件元素
                const fileEl = document.createElement('div');
                fileEl.className = 'nav-file-title';
                fileEl.setAttribute('data-path', testFile.path);
                mockFileExplorer.appendChild(fileEl);

                // 设置视图并尝试处理文件
                explorerViewManager.setupView();
                await explorerViewManager.updateFileItem(testFile);

                // 验证错误处理
                expect(fileEl.getAttribute('data-error')).toBeTruthy();
            });

            it('应该处理并发操作冲突', async () => {
                const testFile = {
                    path: 'conflict.md',
                    name: 'conflict.md',
                    stat: { mtime: Date.now() }
                } as TFile;

                // 创建文件元素
                const fileEl = document.createElement('div');
                fileEl.className = 'nav-file-title';
                fileEl.setAttribute('data-path', testFile.path);
                mockFileExplorer.appendChild(fileEl);

                // 设置视图
                explorerViewManager.setupView();

                // 同时触发多个冲突操作
                const operations = [
                    () => eventBus.publish('file:rename', { ...testFile, path: 'new1.md' }),
                    () => eventBus.publish('file:rename', { ...testFile, path: 'new2.md' }),
                    () => eventBus.publish('file:modify', testFile),
                    () => eventBus.publish('file:delete', testFile.path)
                ];

                // 并发执行所有操作
                await Promise.all(operations.map(op => op()));
                await new Promise(resolve => setTimeout(resolve, 500));

                // 验证最终状态一致性
                const finalElement = mockFileExplorer.querySelector('[data-path]');
                expect(finalElement).toBeTruthy();
                if (finalElement) {
                    const finalPath = finalElement.getAttribute('data-path');
                    expect(fileDisplayCache.get(finalPath!)).toBeTruthy();
                }
            });

            it('应该处理无效的DOM操作', async () => {
                // 创建无效的DOM结构
                const invalidEl = document.createElement('div');
                invalidEl.className = 'nav-file-title';
                // 故意不设置data-path属性
                mockFileExplorer.appendChild(invalidEl);

                // 设置视图
                explorerViewManager.setupView();

                // 等待处理完成
                await new Promise(resolve => setTimeout(resolve, 200));

                // 验证错误处理
                expect(invalidEl.getAttribute('data-error')).toBeTruthy();
            });

            it('应该处理缓存错误', async () => {
                // 模拟缓存错误
                jest.spyOn(fileDisplayCache, 'get').mockImplementation(() => {
                    throw new Error('缓存错误');
                });

                const testFile = {
                    path: 'cache-error.md',
                    name: 'cache-error.md',
                    stat: { mtime: Date.now() }
                } as TFile;

                // 创建文件元素
                const fileEl = document.createElement('div');
                fileEl.className = 'nav-file-title';
                fileEl.setAttribute('data-path', testFile.path);
                mockFileExplorer.appendChild(fileEl);

                // 设置视图并处理文件
                explorerViewManager.setupView();
                await explorerViewManager.updateFileItem(testFile);

                // 恢复原始实现
                jest.restoreAllMocks();

                // 验证错误处理
                expect(fileEl.getAttribute('data-error')).toBeTruthy();
            });
        });
    });
}); 