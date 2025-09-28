import { NativeModules } from 'react-native';

type LocalApiModule = {
    getBaseUrl(): Promise<string>;
} | undefined;

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(() => resolve(), ms));

export async function getLocalApiBase(): Promise<string> {
    const m = (NativeModules as LocalApiModule);
    if (!m) throw new Error('LocalApi native module not linked');

    const start = Date.now();

    while (Date.now() - start < 3000) {
        try {
            const base = await m.getBaseUrl();
            if (base) return base;
        } catch { }

        await sleep(100);
    }
    throw new Error('Local API address not ready');
}