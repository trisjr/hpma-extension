// User bấm Dừng (hoặc run bị huỷ): không phải lỗi, runner kết thúc ở trạng thái 'stopped'.
export default class RunStopped extends Error {
  constructor() {
    super('run stopped');
    this.name = 'RunStopped';
  }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new RunStopped();
}
