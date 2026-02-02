let cvPromise = null;

/**
 * Loads OpenCV.js once and resolves when cv is ready.
 * Uses the official OpenCV docs hosting.
 */
export function loadOpenCv() {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    // If already present and initialized
    if (window.cv && typeof window.cv.Mat === "function") {
      resolve(window.cv);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = "https://docs.opencv.org/4.x/opencv.js";

    script.onload = () => {
      // OpenCV.js uses onRuntimeInitialized
      const cv = window.cv;
      if (!cv) {
        reject(new Error("OpenCV loaded but window.cv is missing."));
        return;
      }

      // If already initialized
      if (typeof cv.Mat === "function") {
        resolve(cv);
        return;
      }

      cv.onRuntimeInitialized = () => resolve(cv);
    };

    script.onerror = () => reject(new Error("Failed to load OpenCV.js script."));

    document.head.appendChild(script);
  });

  return cvPromise;
}
