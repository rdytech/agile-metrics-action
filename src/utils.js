import * as fs from 'fs'
import * as path from 'path'

/**
 * Convert a date to ISO string format
 * @param {Date|string} date - Date to convert
 * @returns {string} ISO formatted date string
 */
export function toISOString(date) {
  return new Date(date).toISOString()
}

/**
 * Calculate hours between two dates
 * @param {Date|string} laterDate - The later date
 * @param {Date|string} earlierDate - The earlier date
 * @returns {number} Hours between the dates
 */
export function hoursBetween(laterDate, earlierDate) {
  return (new Date(laterDate) - new Date(earlierDate)) / 36e5
}

/**
 * Calculate days between two dates
 * @param {Date|string} laterDate - The later date
 * @param {Date|string} earlierDate - The earlier date
 * @returns {number} Days between the dates
 */
export function daysBetween(laterDate, earlierDate) {
  return (new Date(laterDate) - new Date(earlierDate)) / 864e5
}

/**
 * Format hours to a readable days and hours string
 * @param {number|null} hours - Hours to format
 * @returns {string} Formatted string
 */
export function formatHoursToDays(hours) {
  if (hours == null) return 'N/A'
  const days = (hours / 24).toFixed(1)
  const roundedHours = Math.max(0.1, Math.round(hours * 10) / 10) // minimum 0.1h display
  return `${days} days (${roundedHours}h)`
}

/**
 * Ensure a directory exists, creating it recursively if needed
 * @param {string} dirPath - Directory path to create
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * Write JSON data to a file with proper formatting
 * @param {string} filePath - Path to write the file
 * @param {object} data - Data to write as JSON
 */
export function writeJsonFile(filePath, data) {
  ensureDirectoryExists(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

/**
 * Validate that a value is a positive integer
 * @param {string} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {number} Parsed integer value
 * @throws {Error} If value is not a valid positive integer
 */
export function validatePositiveInteger(value, fieldName) {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer, got: ${value}`)
  }
  return parsed
}

/**
 * Validate that a value is a boolean string
 * @param {string} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {boolean} Parsed boolean value
 */
export function validateBoolean(value, fieldName) {
  const lowerValue = value.toLowerCase()
  if (lowerValue === 'true') return true
  if (lowerValue === 'false') return false
  throw new Error(`${fieldName} must be 'true' or 'false', got: ${value}`)
}

/**
 * Sanitize a file path to prevent directory traversal
 * @param {string} filePath - File path to sanitize
 * @returns {string} Sanitized file path
 */
export function sanitizeFilePath(filePath) {
  // Remove any potential directory traversal attempts
  const normalized = path.normalize(filePath)
  if (normalized.includes('..')) {
    throw new Error(`Invalid file path: ${filePath}`)
  }
  return normalized
}
