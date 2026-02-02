// /common/opencvLoader.js
let cvPromise = null;

/**
 * Loads OpenCV.js once and resolves when cv is ready.
 * Loads from local repo: /common/vendor/opencv.js
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

    // IMPORTANT: this is the REAL opencv.js file (the big one)
    script.src = new URL("./vendor/opencv.js", import.meta.url).href;

    script.onload = () => {
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
