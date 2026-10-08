// MediaPipe's face tracker posts usage stats (which task, how fast it ran) to Google about
// once a minute, and has no setting to turn that off. There are no pictures in them, but the
// facecam promises that nothing leaves the player's device, so those requests are stopped
// here before they're sent. MediaPipe stops logging after its first failed request.

const TrackerLogHost = "odml.pa.googleapis.com";

/** True for a request to MediaPipe's usage log. */
export function isTrackerLogRequest(input: RequestInfo | URL): boolean {
  const url = input instanceof Request ? input.url : String(input);
  try {
    return new URL(url, "http://localhost").hostname === TrackerLogHost;
  } catch {
    return false;
  }
}

let blocking = false;

/** Makes the page's fetch turn away MediaPipe's usage log, and nothing else. Safe to call
 * more than once. */
export function blockTrackerLogs(): void {
  if (blocking) {
    return;
  }
  blocking = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) =>
    isTrackerLogRequest(input)
      ? Promise.reject(new TypeError("The facecam sends nothing off this device."))
      : realFetch(input, init);
}
