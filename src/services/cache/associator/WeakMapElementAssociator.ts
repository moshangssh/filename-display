import { IElementAssociator } from '../interfaces';

/**
 * 使用WeakMap实现的元素关联器
 * 用于管理DOM元素与文件路径的关联关系
 * 使用WeakMap避免内存泄漏
 */
export class WeakMapElementAssociator implements IElementAssociator {
    private elementCache: WeakMap<HTMLElement, {
        path: string;
        originalName: string;
    }> = new WeakMap();

    /**
     * 关联元素与文件路径
     * @param element DOM元素
     * @param path 文件路径
     * @param originalName 原始文件名
     */
    public associate(element: HTMLElement, path: string, originalName: string): void {
        this.elementCache.set(element, { path, originalName });
    }

    /**
     * 获取元素关联的文件信息
     * @param element DOM元素
     * @returns 关联信息或undefined
     */
    public getAssociation(element: HTMLElement): { path: string; originalName: string } | undefined {
        return this.elementCache.get(element);
    }
} 