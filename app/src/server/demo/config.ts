/** Demo mode is opt-in: nothing demo-related is reachable unless DEMO_MODE=1. */
export const isDemoEnabled = () => process.env.DEMO_MODE === "1";

export class DemoDisabledError extends Error {
  constructor() {
    super("Demo mode is not enabled (set DEMO_MODE=1)");
    this.name = "DemoDisabledError";
  }
}
