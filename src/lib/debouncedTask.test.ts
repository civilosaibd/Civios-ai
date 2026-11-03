import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebouncedTask } from "./debouncedTask";

describe("createDebouncedTask", () => {
  afterEach(() => vi.useRealTimers());

  it("runs once after a burst of scheduled events", () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 350);
    debounced.schedule();
    vi.advanceTimersByTime(200);
    debounced.schedule();
    vi.advanceTimersByTime(200);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending task during cleanup", () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 350);
    debounced.schedule();
    debounced.cancel();
    vi.advanceTimersByTime(500);
    expect(task).not.toHaveBeenCalled();
  });

  it("allows a new schedule after cancellation", () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 350);
    debounced.schedule();
    debounced.cancel();
    debounced.schedule();
    vi.advanceTimersByTime(350);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
