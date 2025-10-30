// wasm-polyfill.cjs
try {
	if (!globalThis.crypto) {
		// Prefer the real WebCrypto
		const { webcrypto } = require('crypto');
		if (webcrypto) globalThis.crypto = webcrypto;
	}
	// Minimal secure fallback for getRandomValues if something strips webcrypto
	if (!globalThis.crypto?.getRandomValues) {
		const { randomFillSync } = require('crypto');
		globalThis.crypto = globalThis.crypto || {};
		globalThis.crypto.getRandomValues = (typedArray) => {
			if (!ArrayBuffer.isView(typedArray)) {
				throw new TypeError('Expected an ArrayBufferView');
			}
			randomFillSync(typedArray);
			return typedArray;
		};
	}
	// Some WASM runtimes expect self === globalThis
	if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
} catch { }
