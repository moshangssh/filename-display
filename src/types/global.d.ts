import { UnifiedDOMObserver } from '../services/unifiedDOMObserver';

declare global {
    interface Window {
        activeUnifiedObserver: UnifiedDOMObserver | null;
    }
} 