/** Coalesce bursts of realtime events into one trailing refresh. */
export function createDebouncedTask(task: () => void, delayMs = 350) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    schedule() {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        task();
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
