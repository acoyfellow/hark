import type { HarkBridge } from './workbench';

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: { HarkBridge: typeof HarkBridge };
    }
  }
}
