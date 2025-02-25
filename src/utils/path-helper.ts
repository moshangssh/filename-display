import { normalizePath } from 'obsidian';

export class PathHelper {
    static normalize(path: string): string {
        return normalizePath(path.trim());
    }

    static isSubPath(parent: string, child: string): boolean {
        const normalizedParent = this.normalize(parent);
        const normalizedChild = this.normalize(child);
        return normalizedChild.startsWith(normalizedParent);
    }

    static getRelativePath(from: string, to: string): string {
        const normalizedFrom = this.normalize(from);
        const normalizedTo = this.normalize(to);
        return normalizedTo.slice(normalizedFrom.length).replace(/^\//, '');
    }
}
