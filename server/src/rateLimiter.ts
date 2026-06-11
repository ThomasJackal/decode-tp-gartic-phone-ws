const DRAWING_LIMIT = 200;
const DRAWING_WINDOW_MS = 10_000;
const NAMING_LIMIT = 1;
const NAMING_WINDOW_MS = 200;

class RateLimiter {
    private windows: Map<string, { count: number; resetAt: number }> = new Map();

    check(key: string, maxRequests: number, windowMs: number): boolean {
        const now = Date.now();
        const entry = this.windows.get(key);

        if (!entry || now > entry.resetAt) {
            this.windows.set(key, { count: 1, resetAt: now + windowMs });
            return true;
        }

        if (entry.count >= maxRequests) {
            return false;
        }

        entry.count++;
        return true;
    }

    checkDrawing(wsKey: string): boolean {
        return this.check(`drawing:${wsKey}`, DRAWING_LIMIT, DRAWING_WINDOW_MS);
    }

    checkNaming(wsKey: string): boolean {
        return this.check(`naming:${wsKey}`, NAMING_LIMIT, NAMING_WINDOW_MS);
    }

    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.windows) {
            if (now > entry.resetAt) {
                this.windows.delete(key);
            }
        }
    }
}

export const rateLimiter = new RateLimiter();
