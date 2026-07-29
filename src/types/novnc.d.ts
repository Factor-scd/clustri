// Custom type declarations for @novnc/novnc v1.7.0
// The @types/novnc package is outdated and doesn't match the modern API

declare module '@novnc/novnc/core/rfb.js' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: RFBOptions);
    disconnect(): void;
    sendCtrlAltDel(): void;
    clipboardPasteFrom(text: string): void;
    addEventListener<K extends keyof RFBEventMap>(
      type: K,
      listener: (ev: RFBEventMap[K]) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof RFBEventMap>(
      type: K,
      listener: (ev: RFBEventMap[K]) => void,
      options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ): void;
  }

  export interface RFBOptions {
    credentials?: { password?: string; target?: string; securityType?: string };
    shared?: boolean;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export interface RFBEventMap {
    connect: Event;
    disconnect: CustomEvent<{ clean: boolean; reason: string }>;
    credentialsrequired: CustomEvent<{ types: string[] }>;
    clipboard: CustomEvent<{ text: string }>;
    bell: Event;
    focus: Event;
    blur: Event;
  }
}
