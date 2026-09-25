"use strict";
/**
 * Node-side runtime helpers: load IR, optional static serve payload.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Runtime = void 0;
class Runtime {
    /**
     * Validates and returns IR for the browser player.
     */
    execute(input) {
        if (typeof input === 'string') {
            return JSON.parse(input);
        }
        return input;
    }
    toJSON(ir) {
        return JSON.stringify(ir, null, 2);
    }
}
exports.Runtime = Runtime;
