/**
 * chart-loader.js
 * Simple wrapper for Chart.js to provide consistent API across the app
 */

/**
 * Creates a Chart.js instance
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {Object} config - Chart.js configuration object
 * @returns {Chart} Chart.js instance
 */
export async function makeChart(canvas, config) {
  if (!canvas) {
    throw new Error("[chart-loader] Canvas element is required");
  }

  if (typeof Chart === "undefined") {
    throw new Error("[chart-loader] Chart.js library not loaded");
  }

  // Return Chart.js instance directly
  return new Chart(canvas, config);
}

/**
 * Destroys a chart instance
 * @param {Chart} chart - The chart instance to destroy
 */
export function destroyChart(chart) {
  if (chart && typeof chart.destroy === "function") {
    chart.destroy();
  }
}
