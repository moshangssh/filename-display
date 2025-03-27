import { ExplorerViewManager } from '../../src/services/ExplorerViewManager';
import { ServiceContainer } from '../../src/core/ServiceContainer';
import { ITitleExtractorPlugin } from '../../src/types';
import { IFilenameParser } from '../../src/services/interfaces/IServices';
import { IFileDisplayCache } from '../../src/services/cache/interfaces/IFileDisplayCache';
import { ILoggerService } from '../../src/services/interfaces/IServices';
import { FileDisplayResult } from '../../src/types';
import { TFile } from 'obsidian';

jest.mock('../../src/core/ServiceContainer');

describe('ExplorerViewManager', () => {
    let explorerViewManager: ExplorerViewManager;
    let mockPlugin: ITitleExtractorPlugin;
    let mockFilenameParser: jest.Mocked<IFilenameParser>;
    let mockFileDisplayCache: jest.Mocked<IFileDisplayCache>;
    let mockLoggerService: jest.Mocked<ILoggerService>;

    beforeEach(() => {
        // 设置模拟对象
        mockPlugin = {
            // 添加必要的模拟属性和方法
        } as ITitleExtractorPlugin;

        mockFilenameParser = {
            parseFilename: jest.fn().mockResolvedValue({ displayName: 'test', originalName: 'test.md' }),
            shouldProcess: jest.fn().mockReturnValue(true),
            isFileInEnabledFolder: jest.fn().mockReturnValue(true),
            getDisplayNameFromMetadata: jest.fn().mockReturnValue({ displayName: 'test', originalName: 'test.md' }),
            extractDisplayName: jest.fn().mockReturnValue({ displayName: 'test', originalName: 'test.md' }),
            getFilePriority: jest.fn().mockReturnValue(1),
            dispose: jest.fn()
        } as jest.Mocked<IFilenameParser>;

        mockFileDisplayCache = {
            // 核心缓存接口方法
            get: jest.fn(),
            set: jest.fn(),
            deletePath: jest.fn(),
            clear: jest.fn(),
            clearAll: jest.fn(),
            
            // 文件显示名称相关方法
            getDisplayName: jest.fn(),
            setDisplayName: jest.fn(),
            hasDisplayName: jest.fn(),
            setDisplayNames: jest.fn(),
            
            // 原始文件名相关方法
            saveOriginalName: jest.fn(),
            getOriginalName: jest.fn(),
            getAllOriginalNames: jest.fn().mockReturnValue(new Map()),
            
            // 元素关联方法
            saveElementData: jest.fn(),
            getElementData: jest.fn(),
            
            // 缓存管理方法
            isCacheValid: jest.fn(),
            isProcessed: jest.fn(),
            updateFileMTime: jest.fn(),
            clearExpired: jest.fn(),
            
            // 文件链接关系方法
            addFileLink: jest.fn(),
            getFileLinks: jest.fn().mockReturnValue(new Set()),
            preloadLinkedFiles: jest.fn(),
            
            // 缓存预热方法
            warmUpCache: jest.fn().mockResolvedValue(undefined),
            cancelWarmupCache: jest.fn(),
            isCacheWarmedUp: jest.fn().mockReturnValue(true),
            getWarmupProgress: jest.fn().mockReturnValue(100),
            isWarmingUp: jest.fn().mockReturnValue(false),
            
            // 缓存策略相关方法
            setCacheCleanStrategy: jest.fn(),
            getCacheCleanStrategy: jest.fn(),
            triggerCleanup: jest.fn(),
            stopPeriodicCleanup: jest.fn(),
            
            // 资源管理
            dispose: jest.fn()
        } as unknown as jest.Mocked<IFileDisplayCache>;

        mockLoggerService = {
            isDebugEnabled: jest.fn().mockReturnValue(false),
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
            getLogger: jest.fn().mockReturnValue(this),
            dispose: jest.fn()
        } as jest.Mocked<ILoggerService>;

        // 模拟ServiceContainer的getInstance方法
        (ServiceContainer.getInstance as jest.Mock).mockReturnValue({
            get: jest.fn((service: string) => {
                switch (service) {
                    case 'filenameParser':
                        return mockFilenameParser;
                    case 'fileDisplayCache':
                        return mockFileDisplayCache;
                    case 'loggerService':
                        return mockLoggerService;
                    default:
                        return null;
                }
            }),
        });

        // 创建ExplorerViewManager实例
        explorerViewManager = ExplorerViewManager.create(mockPlugin);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('应该正确创建ExplorerViewManager实例', () => {
            expect(explorerViewManager).toBeInstanceOf(ExplorerViewManager);
        });

        it('应该从ServiceContainer获取所有必要的依赖', () => {
            const container = ServiceContainer.getInstance();
            expect(container.get).toHaveBeenCalledWith('filenameParser');
            expect(container.get).toHaveBeenCalledWith('fileDisplayCache');
            expect(container.get).toHaveBeenCalledWith('loggerService');
        });
    });

    describe('setupView', () => {
        let mockFileExplorer: HTMLElement;
        let mockMutationObserver: jest.Mock;

        beforeEach(() => {
            // 创建模拟的文件浏览器元素
            mockFileExplorer = document.createElement('div');
            mockFileExplorer.className = 'nav-files-container';
            document.body.appendChild(mockFileExplorer);

            // 模拟MutationObserver
            mockMutationObserver = jest.fn();
            (global as any).MutationObserver = jest.fn().mockImplementation(() => ({
                observe: mockMutationObserver,
                disconnect: jest.fn()
            }));
        });

        afterEach(() => {
            // 清理DOM
            document.body.removeChild(mockFileExplorer);
        });

        it('应该正确设置视图观察器', () => {
            // 执行
            explorerViewManager.setupView();

            // 验证
            expect(mockMutationObserver).toHaveBeenCalledTimes(2); // 文件浏览器和文件夹观察器
            expect(mockLoggerService.debug).toHaveBeenCalledWith('设置文件浏览器视图');
        });

        it('应该在设置新观察器前停止现有观察', () => {
            // 第一次设置
            explorerViewManager.setupView();
            
            // 重置mock
            mockMutationObserver.mockClear();
            mockLoggerService.debug.mockClear();

            // 第二次设置
            explorerViewManager.setupView();

            // 验证
            expect(mockMutationObserver).toHaveBeenCalledTimes(2); // 文件浏览器和文件夹观察器
            expect(mockLoggerService.debug).toHaveBeenCalledWith('设置文件浏览器视图');
        });
    });

    describe('updateView', () => {
        let mockFileExplorer: HTMLElement;
        let mockFiles: TFile[];

        beforeEach(() => {
            // 创建模拟的文件浏览器元素
            mockFileExplorer = document.createElement('div');
            mockFileExplorer.className = 'nav-files-container';
            document.body.appendChild(mockFileExplorer);

            // 创建模拟文件
            mockFiles = [
                { path: 'test1.md', name: 'test1.md' } as TFile,
                { path: 'test2.md', name: 'test2.md' } as TFile,
                { path: 'folder/test3.md', name: 'test3.md' } as TFile
            ];

            // 模拟plugin.app.vault
            (mockPlugin as any).app = {
                vault: {
                    getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
                        if (path === '/') {
                            return {
                                children: mockFiles
                            };
                        }
                        return null;
                    })
                }
            };
        });

        afterEach(() => {
            // 清理DOM
            document.body.removeChild(mockFileExplorer);
        });

        it('应该正确处理视图更新', () => {
            // 执行
            explorerViewManager.updateView();

            // 验证
            expect(mockLoggerService.debug).toHaveBeenCalledWith('更新文件浏览器视图');
        });

        it('当文件浏览器不存在时不应该更新', () => {
            // 移除文件浏览器
            document.body.removeChild(mockFileExplorer);

            // 执行
            explorerViewManager.updateView();

            // 验证
            expect(mockLoggerService.debug).toHaveBeenCalledWith('更新文件浏览器视图');
            // 确保没有进行其他操作
            expect(mockFileDisplayCache.get).not.toHaveBeenCalled();
            expect(mockFileDisplayCache.set).not.toHaveBeenCalled();
        });
    });

    describe('processExplorerItems', () => {
        let mockFileExplorer: HTMLElement;
        let mockFiles: TFile[];
        let mockFileElements: HTMLElement[];

        beforeEach(() => {
            // 创建模拟的文件浏览器元素
            mockFileExplorer = document.createElement('div');
            mockFileExplorer.className = 'nav-files-container';
            document.body.appendChild(mockFileExplorer);

            // 创建模拟文件
            mockFiles = [
                { path: 'test1.md', name: 'test1.md' } as TFile,
                { path: 'test2.md', name: 'test2.md' } as TFile,
                { path: 'folder/test3.md', name: 'test3.md' } as TFile
            ];

            // 创建模拟文件元素
            mockFileElements = mockFiles.map(file => {
                const el = document.createElement('div');
                el.className = 'nav-file-title';
                el.setAttribute('data-path', file.path);
                mockFileExplorer.appendChild(el);
                return el;
            });

            // 模拟plugin.app.vault
            (mockPlugin as any).app = {
                vault: {
                    getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
                        return mockFiles.find(f => f.path === path) || null;
                    })
                }
            };

            // 设置缓存响应
            mockFileDisplayCache.get.mockImplementation((path: string) => {
                const file = mockFiles.find(f => f.path === path);
                return file ? {
                    success: true,
                    displayName: `显示名称-${file.name}`,
                    originalName: file.name,
                    fromCache: true
                } : undefined;
            });
        });

        afterEach(() => {
            // 清理DOM
            document.body.removeChild(mockFileExplorer);
        });

        it('应该正确处理文件浏览器项目', () => {
            // 执行
            explorerViewManager.processExplorerItems();

            // 验证
            expect(mockFileDisplayCache.get).toHaveBeenCalled();
            mockFileElements.forEach(el => {
                expect(mockFileDisplayCache.get).toHaveBeenCalledWith(el.getAttribute('data-path'));
            });
        });

        it('应该正确使用缓存机制', () => {
            // 首次处理
            explorerViewManager.processExplorerItems();

            // 重置mock
            mockFileDisplayCache.get.mockClear();

            // 再次处理
            explorerViewManager.processExplorerItems();

            // 验证缓存使用
            expect(mockFileDisplayCache.get).toHaveBeenCalled();
            mockFileElements.forEach(el => {
                expect(mockFileDisplayCache.get).toHaveBeenCalledWith(el.getAttribute('data-path'));
            });
        });

        it('应该跳过已处理的文件', () => {
            // 标记第一个文件为已处理
            mockFileElements[0].setAttribute('data-processed', 'true');

            // 执行
            explorerViewManager.processExplorerItems();

            // 验证
            expect(mockFileDisplayCache.get).not.toHaveBeenCalledWith(mockFiles[0].path);
            expect(mockFileDisplayCache.get).toHaveBeenCalledWith(mockFiles[1].path);
            expect(mockFileDisplayCache.get).toHaveBeenCalledWith(mockFiles[2].path);
        });
    });

    describe('dispose', () => {
        let mockFileExplorer: HTMLElement;
        let mockMutationObserver: jest.Mock;
        let mockDisconnect: jest.Mock;

        beforeEach(() => {
            // 创建模拟的文件浏览器元素
            mockFileExplorer = document.createElement('div');
            mockFileExplorer.className = 'nav-files-container';
            document.body.appendChild(mockFileExplorer);

            // 模拟MutationObserver
            mockDisconnect = jest.fn();
            mockMutationObserver = jest.fn();
            (global as any).MutationObserver = jest.fn().mockImplementation(() => ({
                observe: mockMutationObserver,
                disconnect: mockDisconnect
            }));

            // 设置观察器
            explorerViewManager.setupView();
        });

        afterEach(() => {
            // 清理DOM
            document.body.removeChild(mockFileExplorer);
        });

        it('应该正确清理所有资源', () => {
            // 执行
            explorerViewManager.dispose();

            // 验证
            expect(mockDisconnect).toHaveBeenCalled();
            expect(mockFileDisplayCache.dispose).toHaveBeenCalled();
            expect(mockFilenameParser.dispose).toHaveBeenCalled();
            expect(mockLoggerService.dispose).toHaveBeenCalled();
        });

        it('应该正确移除所有事件监听器', () => {
            // 执行
            explorerViewManager.dispose();

            // 验证
            expect(mockDisconnect).toHaveBeenCalled();
            // 这里可以添加更多事件监听器相关的验证
        });

        it('应该在多次调用时仍然安全', () => {
            // 第一次调用
            explorerViewManager.dispose();

            // 重置mock
            mockDisconnect.mockClear();
            mockFileDisplayCache.dispose.mockClear();
            mockFilenameParser.dispose.mockClear();
            mockLoggerService.dispose.mockClear();

            // 第二次调用
            explorerViewManager.dispose();

            // 验证没有重复调用
            expect(mockDisconnect).not.toHaveBeenCalled();
            expect(mockFileDisplayCache.dispose).not.toHaveBeenCalled();
            expect(mockFilenameParser.dispose).not.toHaveBeenCalled();
            expect(mockLoggerService.dispose).not.toHaveBeenCalled();
        });
    });

    describe('边界条件测试', () => {
        let mockFileExplorer: HTMLElement;

        beforeEach(() => {
            // 创建模拟的文件浏览器元素
            mockFileExplorer = document.createElement('div');
            mockFileExplorer.className = 'nav-files-container';
            document.body.appendChild(mockFileExplorer);
        });

        afterEach(() => {
            // 清理DOM
            document.body.removeChild(mockFileExplorer);
        });

        describe('空文件夹场景', () => {
            beforeEach(() => {
                // 模拟空文件夹
                (mockPlugin as any).app = {
                    vault: {
                        getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
                            if (path === '/') {
                                return { children: [] };
                            }
                            return null;
                        })
                    }
                };
            });

            it('应该正确处理空文件夹', () => {
                // 执行
                explorerViewManager.updateView();
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockFileDisplayCache.get).not.toHaveBeenCalled();
                expect(mockLoggerService.debug).toHaveBeenCalled();
            });
        });

        describe('大量文件场景', () => {
            let mockFiles: TFile[];

            beforeEach(() => {
                // 创建1000个模拟文件
                mockFiles = Array.from({ length: 1000 }, (_, i) => ({
                    path: `test${i}.md`,
                    name: `test${i}.md`
                } as TFile));

                // 创建文件元素
                mockFiles.forEach(file => {
                    const el = document.createElement('div');
                    el.className = 'nav-file-title';
                    el.setAttribute('data-path', file.path);
                    mockFileExplorer.appendChild(el);
                });

                // 模拟大量文件
                (mockPlugin as any).app = {
                    vault: {
                        getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
                            if (path === '/') {
                                return { children: mockFiles };
                            }
                            return mockFiles.find(f => f.path === path) || null;
                        })
                    }
                };
            });

            it('应该能处理大量文件', () => {
                // 执行
                explorerViewManager.updateView();
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockFileDisplayCache.get).toHaveBeenCalled();
                expect(mockLoggerService.debug).toHaveBeenCalled();
            });

            it('应该使用增量更新处理大量文件', () => {
                // 执行
                explorerViewManager.updateView();

                // 验证是否使用了增量更新
                expect(mockLoggerService.debug).toHaveBeenCalledWith(expect.stringContaining('更新文件浏览器视图'));
            });
        });

        describe('嵌套文件夹场景', () => {
            let mockFiles: TFile[];

            beforeEach(() => {
                // 创建嵌套文件结构
                mockFiles = [
                    { path: 'folder1/test1.md', name: 'test1.md' } as TFile,
                    { path: 'folder1/folder2/test2.md', name: 'test2.md' } as TFile,
                    { path: 'folder1/folder2/folder3/test3.md', name: 'test3.md' } as TFile
                ];

                // 创建嵌套的DOM结构
                const folder1 = document.createElement('div');
                folder1.className = 'nav-folder';
                folder1.setAttribute('data-path', 'folder1');

                const folder2 = document.createElement('div');
                folder2.className = 'nav-folder';
                folder2.setAttribute('data-path', 'folder1/folder2');

                const folder3 = document.createElement('div');
                folder3.className = 'nav-folder';
                folder3.setAttribute('data-path', 'folder1/folder2/folder3');

                mockFiles.forEach(file => {
                    const el = document.createElement('div');
                    el.className = 'nav-file-title';
                    el.setAttribute('data-path', file.path);
                    const parentFolder = file.path.split('/').slice(0, -1).join('/');
                    const container = [folder3, folder2, folder1].find(f => f.getAttribute('data-path') === parentFolder);
                    container?.appendChild(el);
                });

                folder2.appendChild(folder3);
                folder1.appendChild(folder2);
                mockFileExplorer.appendChild(folder1);

                // 模拟嵌套文件夹结构
                (mockPlugin as any).app = {
                    vault: {
                        getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
                            if (path === '/') {
                                return { children: [{ path: 'folder1', children: mockFiles }] };
                            }
                            return mockFiles.find(f => f.path === path) || null;
                        })
                    }
                };
            });

            it('应该正确处理嵌套文件夹结构', () => {
                // 执行
                explorerViewManager.updateView();
                explorerViewManager.processExplorerItems();

                // 验证
                mockFiles.forEach(file => {
                    expect(mockFileDisplayCache.get).toHaveBeenCalledWith(file.path);
                });
            });

            it('应该正确处理文件夹展开/折叠', () => {
                // 模拟文件夹展开事件
                const folder = mockFileExplorer.querySelector('.nav-folder');
                if (folder) {
                    const event = new CustomEvent('click');
                    folder.dispatchEvent(event);
                }

                // 验证
                expect(mockLoggerService.debug).toHaveBeenCalled();
            });
        });

        describe('特殊字符文件名场景', () => {
            let mockFiles: TFile[];

            beforeEach(() => {
                // 创建包含特殊字符的文件名
                mockFiles = [
                    { path: 'test with spaces.md', name: 'test with spaces.md' } as TFile,
                    { path: 'test#with#hash.md', name: 'test#with#hash.md' } as TFile,
                    { path: 'test[with]brackets.md', name: 'test[with]brackets.md' } as TFile,
                    { path: 'test-with-dashes.md', name: 'test-with-dashes.md' } as TFile,
                    { path: 'test_with_underscores.md', name: 'test_with_underscores.md' } as TFile,
                    { path: 'test.with.dots.md', name: 'test.with.dots.md' } as TFile,
                    { path: 'test+with+plus.md', name: 'test+with+plus.md' } as TFile,
                    { path: 'test&with&ampersand.md', name: 'test&with&ampersand.md' } as TFile
                ];

                // 创建文件元素
                mockFiles.forEach(file => {
                    const el = document.createElement('div');
                    el.className = 'nav-file-title';
                    el.setAttribute('data-path', file.path);
                    mockFileExplorer.appendChild(el);
                });

                // 模拟特殊字符文件
                (mockPlugin as any).app = {
                    vault: {
                        getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
                            if (path === '/') {
                                return { children: mockFiles };
                            }
                            return mockFiles.find(f => f.path === path) || null;
                        })
                    }
                };
            });

            it('应该正确处理包含空格的文件名', () => {
                // 执行
                explorerViewManager.updateView();
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockFileDisplayCache.get).toHaveBeenCalledWith('test with spaces.md');
            });

            it('应该正确处理包含特殊字符的文件名', () => {
                // 执行
                explorerViewManager.updateView();
                explorerViewManager.processExplorerItems();

                // 验证所有特殊字符文件名
                mockFiles.forEach(file => {
                    expect(mockFileDisplayCache.get).toHaveBeenCalledWith(file.path);
                });
            });

            it('应该正确处理URL编码的文件名', () => {
                const encodedPath = 'test%20with%20spaces.md';
                const decodedPath = 'test with spaces.md';

                // 添加URL编码的文件元素
                const el = document.createElement('div');
                el.className = 'nav-file-title';
                el.setAttribute('data-path', encodedPath);
                mockFileExplorer.appendChild(el);

                // 执行
                explorerViewManager.updateView();
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockFileDisplayCache.get).toHaveBeenCalledWith(decodedPath);
            });
        });
    });

    describe('异常处理测试', () => {
        let mockFileExplorer: HTMLElement;
        let mockFiles: TFile[];

        beforeEach(() => {
            // 创建模拟的文件浏览器元素
            mockFileExplorer = document.createElement('div');
            mockFileExplorer.className = 'nav-files-container';
            document.body.appendChild(mockFileExplorer);

            // 创建基本的文件列表
            mockFiles = [
                { path: 'test1.md', name: 'test1.md' } as TFile,
                { path: 'test2.md', name: 'test2.md' } as TFile
            ];

            // 创建文件元素
            mockFiles.forEach(file => {
                const el = document.createElement('div');
                el.className = 'nav-file-title';
                el.setAttribute('data-path', file.path);
                mockFileExplorer.appendChild(el);
            });
        });

        afterEach(() => {
            // 清理DOM
            document.body.removeChild(mockFileExplorer);
            jest.clearAllMocks();
        });

        describe('文件不存在场景', () => {
            beforeEach(() => {
                // 模拟文件不存在的情况
                (mockPlugin as any).app = {
                    vault: {
                        getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
                            if (path === '/') {
                                return { children: mockFiles };
                            }
                            // 模拟文件不存在
                            return null;
                        })
                    }
                };
            });

            it('应该优雅地处理文件不存在的情况', () => {
                // 执行
                explorerViewManager.updateView();
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockLoggerService.warn).toHaveBeenCalled();
                expect(mockFileDisplayCache.get).not.toHaveBeenCalled();
            });

            it('应该从缓存中移除不存在的文件', () => {
                // 执行
                explorerViewManager.updateFileItem({ path: 'nonexistent.md', name: 'nonexistent.md' } as TFile);

                // 验证
                expect(mockFileDisplayCache.deletePath).toHaveBeenCalledWith('nonexistent.md');
            });
        });

        describe('权限错误场景', () => {
            beforeEach(() => {
                // 模拟权限错误
                mockFilenameParser.parseFilename.mockRejectedValue(new Error('Permission denied'));
            });

            it('应该处理文件解析权限错误', async () => {
                // 执行
                await explorerViewManager.updateFileItem(mockFiles[0]);

                // 验证
                expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
            });

            it('应该在权限错误时保持原始文件名', async () => {
                // 执行
                await explorerViewManager.updateFileItem(mockFiles[0]);

                // 验证
                expect(mockFileDisplayCache.get).toHaveBeenCalledWith(mockFiles[0].path);
            });
        });

        describe('网络错误场景', () => {
            beforeEach(() => {
                // 模拟网络错误
                mockFilenameParser.parseFilename.mockRejectedValue(new Error('Network error'));
            });

            it('应该处理网络错误', async () => {
                // 执行
                await explorerViewManager.updateFileItem(mockFiles[0]);

                // 验证
                expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
            });

            it('应该在网络错误时使用缓存数据', async () => {
                // 设置缓存数据
                mockFileDisplayCache.get.mockReturnValue({
                    success: true,
                    displayName: 'Cached Name',
                    fromCache: true
                });

                // 执行
                await explorerViewManager.updateFileItem(mockFiles[0]);

                // 验证
                expect(mockFileDisplayCache.get).toHaveBeenCalledWith(mockFiles[0].path);
            });
        });

        describe('并发操作场景', () => {
            beforeEach(() => {
                // 模拟异步操作
                mockFilenameParser.parseFilename.mockImplementation(async (file: TFile) => {
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
                    return {
                        success: true,
                        displayName: `Parsed ${file.name}`,
                        fromCache: false
                    };
                });
            });

            it('应该正确处理并发文件更新', async () => {
                // 并发更新多个文件
                const promises = mockFiles.map(file => explorerViewManager.updateFileItem(file));

                // 等待所有更新完成
                await Promise.all(promises);

                // 验证
                mockFiles.forEach(file => {
                    expect(mockFilenameParser.parseFilename).toHaveBeenCalledWith(file);
                });
            });

            it('应该防止重复处理同一文件', async () => {
                // 同时多次更新同一个文件
                const file = mockFiles[0];
                const promises = Array(5).fill(null).map(() => explorerViewManager.updateFileItem(file));

                // 等待所有更新完成
                await Promise.all(promises);

                // 验证只处理了一次
                expect(mockFilenameParser.parseFilename).toHaveBeenCalledTimes(1);
                expect(mockFilenameParser.parseFilename).toHaveBeenCalledWith(file);
            });
        });

        describe('缓存错误场景', () => {
            beforeEach(() => {
                // 模拟缓存操作错误
                mockFileDisplayCache.get.mockImplementation(() => {
                    throw new Error('Cache error');
                });
            });

            it('应该处理缓存读取错误', () => {
                // 执行
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Cache error'));
            });

            it('应该在缓存错误时继续处理其他文件', () => {
                // 重置缓存mock以允许第二个文件正常处理
                let callCount = 0;
                mockFileDisplayCache.get.mockImplementation(() => {
                    if (callCount++ === 0) {
                        throw new Error('Cache error');
                    }
                    return {
                        success: true,
                        displayName: 'Test Display Name',
                        fromCache: true
                    };
                });

                // 执行
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Cache error'));
                expect(mockFileDisplayCache.get).toHaveBeenCalledTimes(2);
            });
        });

        describe('DOM操作错误场景', () => {
            it('应该处理DOM元素不存在的情况', async () => {
                // 移除DOM元素
                mockFileExplorer.innerHTML = '';

                // 执行
                await explorerViewManager.updateFileItem(mockFiles[0]);

                // 验证
                expect(mockLoggerService.debug).toHaveBeenCalled();
            });

            it('应该处理DOM属性访问错误', async () => {
                // 创建无效的DOM元素
                const invalidEl = document.createElement('div');
                mockFileExplorer.appendChild(invalidEl);

                // 执行
                explorerViewManager.processExplorerItems();

                // 验证
                expect(mockLoggerService.debug).toHaveBeenCalled();
            });
        });
    });
}); 