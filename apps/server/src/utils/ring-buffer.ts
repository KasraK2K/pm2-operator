export class RingBuffer<T> {
  private readonly limit: number;
  private items: T[] = [];

  constructor(limit: number) {
    this.limit = limit;
  }

  push(item: T) {
    this.items.push(item);

    if (this.items.length > this.limit) {
      this.items = this.items.slice(this.items.length - this.limit);
    }
  }

  clear() {
    this.items = [];
  }

  values() {
    return [...this.items];
  }
}

