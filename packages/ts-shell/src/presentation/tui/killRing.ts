export class KillRing {
  private readonly ring: string[] = [];
  private readonly capacity: number;
  private pointer = -1;

  constructor(capacity: number = 60) {
    this.capacity = capacity;
  }

  push(text: string): void {
    if (!text) return;
    if (this.ring.length >= this.capacity) {
      this.ring.shift();
    }
    this.ring.push(text);
    this.pointer = this.ring.length - 1;
  }

  peek(): string | undefined {
    if (this.ring.length === 0) return undefined;
    return this.ring[this.pointer >= 0 ? this.pointer : this.ring.length - 1];
  }

  rotate(): string | undefined {
    if (this.ring.length <= 1) return this.peek();
    this.pointer = (this.pointer - 1 + this.ring.length) % this.ring.length;
    return this.ring[this.pointer];
  }

  clear(): void {
    this.ring.length = 0;
    this.pointer = -1;
  }
}
