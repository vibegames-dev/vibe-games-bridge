type Subscriber<T> = (data: T) => void;

export class Observable<T> {
  private listeners: Subscriber<T>[] = [];

  constructor(private data: T) {}

  subscribe = (listener: Subscriber<T>) => {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((s) => s !== listener);
    };
  };

  getValue = () => this.data;

  setValue = (data: T) => {
    this.data = data;
    for (const listener of this.listeners) {
      listener(this.data);
    }
  };

  setValueWithoutNotify = (data: T) => {
    this.data = data;
  };
}
