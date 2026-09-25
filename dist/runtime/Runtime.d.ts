/**
 * Node-side runtime helpers: load IR, optional static serve payload.
 */
import type { TimelineIR } from '../compiler/ir';
export declare class Runtime {
    /**
     * Validates and returns IR for the browser player.
     */
    execute(input: TimelineIR | string): TimelineIR;
    toJSON(ir: TimelineIR): string;
}
