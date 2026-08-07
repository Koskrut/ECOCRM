/** Bounded FIFO queue for real-time audio frames (drop-oldest on overflow). */
export class FifoQueue<T> {
  private readonly items: T[] = [];

  constructor(private readonly maxSize: number) {}

  push(item: T): void {
    if (this.items.length >= this.maxSize) {
      this.items.shift();
    }
    this.items.push(item);
  }

  shift(): T | undefined {
    return this.items.shift();
  }

  clear(): void {
    this.items.length = 0;
  }

  get length(): number {
    return this.items.length;
  }
}
