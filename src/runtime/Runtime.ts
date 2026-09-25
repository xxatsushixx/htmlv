/**
 * Node-side runtime helpers: load IR, optional static serve payload.
 */

import type { TimelineIR } from '../compiler/ir';

export class Runtime {
  /**
   * Validates and returns IR for the browser player.
   */
  public execute(input: TimelineIR | string): TimelineIR {
    if (typeof input === 'string') {
      return JSON.parse(input) as TimelineIR;
    }
    return input;
  }

  public toJSON(ir: TimelineIR): string {
    return JSON.stringify(ir, null, 2);
  }
}
