declare module "modesl" {
  export class Connection {
    constructor(host: string, port: number, password: string, callback: () => void);
    on(event: string, callback: (data: Event) => void): void;
    disconnect(): void;
    bgapi(command: string, callback: (res: ESLresponse) => void): void;
    api(command: string, callback: (res: ESLresponse) => void): void;
  }

  export class Event {
    getHeader(name: string): string | undefined;
  }

  export class ESLresponse {
    getBody(): string;
  }
}
