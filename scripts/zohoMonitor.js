#!/usr/bin/env node

/**
 * Zoho Check-in/Check-out Monitor
 * Runs 24/7 and performs check-in/check-out at scheduled times
 */

const { spawn } = require('child_process');
const path = require('path');

// Logging utility
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (level === 'ERROR') {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
}

// Scheduled times (24-hour format)
const CHECKIN_TIME = { hour: 6, minute: 0 };  // 1:06 PM
const CHECKOUT_TIME = { hour: 13, minute: 45 }; // 3:30 PM

// Days of week (1=Monday, 2=Tuesday, ..., 5=Friday)
const WEEKDAYS = [1, 2, 3, 4, 5];

// Track last execution to avoid duplicate runs
let lastCheckinDate = null;
let lastCheckoutDate = null;

/**
 * Check if current time matches scheduled time
 */
function shouldRunCheckin() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dateStr = now.toDateString();
  
  // Check if it's a weekday
  if (!WEEKDAYS.includes(dayOfWeek)) {
    return false;
  }
  
  // Check if time matches check-in time
  if (hour === CHECKIN_TIME.hour && minute === CHECKIN_TIME.minute) {
    // Only run once per day
    if (lastCheckinDate !== dateStr) {
      lastCheckinDate = dateStr;
      return true;
    }
  }
  
  return false;
}

/**
 * Check if current time matches scheduled time
 */
function shouldRunCheckout() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dateStr = now.toDateString();
  
  // Check if it's a weekday
  if (!WEEKDAYS.includes(dayOfWeek)) {
    return false;
  }
  
  // Check if time matches check-out time
  if (hour === CHECKOUT_TIME.hour && minute === CHECKOUT_TIME.minute) {
    // Only run once per day
    if (lastCheckoutDate !== dateStr) {
      lastCheckoutDate = dateStr;
      return true;
    }
  }
  
  return false;
}

/**
 * Run the check-in/check-out script
 */
function runCheckinScript() {
  log('Triggering check-in/check-out script...');
  
  // Load environment variables from .env file
  require('dotenv').config();
  
  const scriptPath = path.join(__dirname, 'zohoCheckin.js');
  const child = spawn('node', [scriptPath], {
    cwd: path.dirname(__dirname), // Project root directory
    stdio: 'inherit',
    detached: false,
    env: {
      ...process.env, // Pass all current environment variables
      HEADLESS: 'false' // Force headed mode to show browser
    }
  });
  
  child.on('error', (error) => {
    log(`Error running script: ${error.message}`, 'ERROR');
  });
  
  child.on('exit', (code) => {
    if (code === 0) {
      log('Check-in/check-out script completed successfully');
    } else {
      log(`Check-in/check-out script exited with code ${code}`, 'ERROR');
    }
  });
}

/**
 * Main monitoring loop
 */
function startMonitoring() {
  log('Zoho Check-in/Check-out Monitor started - Running 24/7');
  const checkinTimeStr = `${CHECKIN_TIME.hour > 12 ? CHECKIN_TIME.hour - 12 : CHECKIN_TIME.hour}:${CHECKIN_TIME.minute.toString().padStart(2, '0')} ${CHECKIN_TIME.hour >= 12 ? 'PM' : 'AM'}`;
  const checkoutTimeStr = `${CHECKOUT_TIME.hour > 12 ? CHECKOUT_TIME.hour - 12 : CHECKOUT_TIME.hour}:${CHECKOUT_TIME.minute.toString().padStart(2, '0')} ${CHECKOUT_TIME.hour >= 12 ? 'PM' : 'AM'}`;
  log(`Check-in scheduled: ${checkinTimeStr} (Weekdays)`);
  log(`Check-out scheduled: ${checkoutTimeStr} (Weekdays)`);
  
  // Check every minute
  setInterval(() => {
    const now = new Date();
    
    if (shouldRunCheckin()) {
      log('Check-in time detected - Running check-in...');
      runCheckinScript();
    }
    
    if (shouldRunCheckout()) {
      log('Check-out time detected - Running check-out...');
      runCheckinScript();
    }
    
    // Reset daily tracking at midnight
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      lastCheckinDate = null;
      lastCheckoutDate = null;
      log('Daily reset - Ready for new check-in/check-out');
    }
  }, 60000); // Check every minute
  
  // Keep the process alive
  log('Monitor is running. Press Ctrl+C to stop.');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down monitor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down monitor...');
  process.exit(0);
});

// Start monitoring
startMonitoring();
