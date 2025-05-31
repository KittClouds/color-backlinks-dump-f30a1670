
import React from 'react';

// Type for the batching function
type BatchingFunction = (callback: () => void) => void;

// Detect React version and available batching methods
const detectBatchingMethod = (): { method: string; batchFn: BatchingFunction } => {
  // Check if we're in React 19+ (where unstable_batchedUpdates doesn't exist)
  const reactVersion = React.version;
  const majorVersion = parseInt(reactVersion.split('.')[0], 10);
  
  console.log(`[ReactCompat] Detected React version: ${reactVersion}`);
  
  // Try to import unstable_batchedUpdates for React 18
  let unstable_batchedUpdates: BatchingFunction | undefined;
  try {
    // Dynamic import to avoid build errors if it doesn't exist
    const reactDom = require('react-dom');
    unstable_batchedUpdates = reactDom.unstable_batchedUpdates;
  } catch (error) {
    console.warn('[ReactCompat] Could not import react-dom or unstable_batchedUpdates');
  }
  
  if (majorVersion >= 19) {
    // React 19+ has automatic batching, so we just execute the callback
    console.log('[ReactCompat] Using React 19+ automatic batching');
    return {
      method: 'react19-automatic',
      batchFn: (callback: () => void) => callback()
    };
  } else if (unstable_batchedUpdates) {
    // React 18 with unstable_batchedUpdates available
    console.log('[ReactCompat] Using React 18 unstable_batchedUpdates');
    return {
      method: 'react18-unstable',
      batchFn: unstable_batchedUpdates
    };
  } else {
    // Fallback: just execute the callback
    console.warn('[ReactCompat] No batching method available, using direct execution');
    return {
      method: 'fallback-direct',
      batchFn: (callback: () => void) => callback()
    };
  }
};

// Initialize the batching method
const { method, batchFn } = detectBatchingMethod();

// Export the unified batching function
export const batchUpdates: BatchingFunction = batchFn;

// Export method info for debugging
export const batchingMethod = method;

// Export a function to get batching info
export const getBatchingInfo = () => ({
  reactVersion: React.version,
  method,
  isReact19: parseInt(React.version.split('.')[0], 10) >= 19
});
