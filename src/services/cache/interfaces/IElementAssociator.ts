// src/services/cache/interfaces/IElementAssociator.ts
export interface IElementAssociator {
    associate(element: HTMLElement, path: string, originalName: string): void;
    getAssociation(element: HTMLElement): { path: string; originalName: string } | undefined;
} 