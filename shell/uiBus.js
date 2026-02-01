// Tiny event bus for UI messages (status now, more later)
export const UI = (() => {
  const listeners = new Map(); // eventName -> Set(callback)

  function on(eventName, callback) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(callback);
    return () => listeners.get(eventName)?.delete(callback);
  }

  function emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) return;
    for (const cb of set) cb(payload);
  }

  function statusLeft(keyOrText, options = {}) {
    emit("status:left", { keyOrText, options });
  }

  function statusRight(keyOrText, options = {}) {
    emit("status:right", { keyOrText, options });
  }

  return { on, emit, statusLeft, statusRight };
})();
