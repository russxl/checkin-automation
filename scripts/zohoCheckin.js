#!/usr/bin/env node

/**
 * Zoho Check-in Automation
 * Automatically logs into Zoho and performs check-in action
 * Runs in headless mode via Playwright
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration from environment variables
const ZOHO_EMAIL = process.env.ZOHO_EMAIL;
const ZOHO_PASSWORD = process.env.ZOHO_PASSWORD;
const ZOHO_URL = process.env.ZOHO_URL || 'https://accounts.zoho.com/signin?servicename=zohopeople&signupurl=https://www.zoho.com/people/signup.html';
const USE_GOOGLE_LOGIN = process.env.USE_GOOGLE_LOGIN === 'true' || !ZOHO_PASSWORD;
const STORAGE_STATE_PATH = path.join(__dirname, '..', 'logs', 'zoho-auth-state.json');
const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'logs', 'browser-data');
const USE_PERSISTENT_CONTEXT = process.env.USE_PERSISTENT_CONTEXT !== 'false'; // Default to true

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

/**
 * Main automation function
 */
async function performZohoCheckin() {
  let browser = null;
  let persistentContext = null;
  
  try {
    // Step 1: Validate email
    if (!ZOHO_EMAIL) {
      log('Zoho email not configured. Please set ZOHO_EMAIL environment variable.', 'ERROR');
      process.exit(1);
    }
    
    // Step 2: Check for saved authentication state
    const hasSavedState = fs.existsSync(STORAGE_STATE_PATH);
    
    // Always run in headed mode (visible browser) unless HEADLESS=true is explicitly set
    // This allows you to see what's happening
    const useHeadless = process.env.HEADLESS === 'true';
    
    if (hasSavedState) {
      log('Found saved authentication state. Attempting to reuse session...');
    } else {
      if (USE_GOOGLE_LOGIN) {
        log('No saved authentication state found. Will run in headed mode for Google OAuth login.', 'INFO');
        log('Please complete the Google login in the browser window that opens.', 'INFO');
      } else if (!ZOHO_PASSWORD) {
        log('No password provided and no saved state. Please set ZOHO_PASSWORD or USE_GOOGLE_LOGIN=true', 'ERROR');
        process.exit(1);
      }
    }
    
    if (!useHeadless) {
      log('Running in headed mode - browser window will be visible');
    } else {
      log('Running in headless mode - browser window will be hidden');
    }
    
    // Step 3: Launch browser with persistent context to reuse sessions
    log(`Launching browser (headless: ${useHeadless})...`);
    
    let page;
    let persistentContext = null;
    
    // Use persistent context to save and reuse browser sessions (including Google login)
    // This way you only need to log in once, and it will remember your Google session
    if (USE_PERSISTENT_CONTEXT) {
      // Create user data directory if it doesn't exist
      if (!fs.existsSync(USER_DATA_DIR)) {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
        log(`Created browser data directory: ${USER_DATA_DIR}`);
      }
      
      log('Using persistent browser context - your Google login will be remembered after first use');
      
      // Browser arguments to make it appear more like a real browser (avoid Google security blocks)
      const browserArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // Hide automation
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-infobars',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--start-maximized',
        '--window-size=1920,1080',
        '--disable-extensions-except',
        '--disable-extensions',
        '--exclude-switches=enable-automation',
        '--disable-blink-features=AutomationControlled'
      ];
      
      // Use a more realistic user agent
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      
      persistentContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: useHeadless,
        args: browserArgs,
        userAgent: userAgent,
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
        // Add extra HTTP headers to look more legitimate
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      // Get the first page or create a new one
      const pages = persistentContext.pages();
      page = pages.length > 0 ? pages[0] : await persistentContext.newPage();
      
      // Enhanced stealth script to avoid Google detection
      await page.addInitScript(() => {
        // Remove webdriver property completely
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false
        });
        
        // Override plugins to look real
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            return [
              {
                0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                length: 1,
                name: 'Chrome PDF Plugin'
              },
              {
                0: { type: 'application/pdf', suffixes: 'pdf', description: '' },
                description: '',
                filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                length: 1,
                name: 'Chrome PDF Viewer'
              }
            ];
          }
        });
        
        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        
        // Chrome runtime object
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
        
        // Override getBattery
        if (navigator.getBattery) {
          navigator.getBattery = () => Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1
          });
        }
      });
      
      // Set browser to null since we're using persistent context
      browser = null;
    } else {
      // Browser arguments to make it appear more like a real browser
      const browserArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // Hide automation
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-infobars',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--start-maximized',
        '--window-size=1920,1080'
      ];
      
      // Use regular browser launch with saved state
      browser = await chromium.launch({
        headless: useHeadless,
        args: browserArgs
      });
      
      const contextOptions = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true
      };
      
      // Load saved state if available
      if (hasSavedState) {
        try {
          contextOptions.storageState = STORAGE_STATE_PATH;
          log('Loaded saved authentication state');
        } catch (err) {
          log(`Warning: Could not load saved state: ${err.message}`, 'ERROR');
        }
      }
      
      const context = await browser.newContext(contextOptions);
      page = await context.newPage();
      
      // Remove webdriver property to avoid detection
      await page.addInitScript(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        
        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        
        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        
        // Chrome runtime
        window.chrome = {
          runtime: {}
        };
      });
    }
    
    // Step 4: Navigate to Zoho login page
    log(`Navigating to ${ZOHO_URL}...`);
    
    // Set additional headers before navigation
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    });
    
    await page.goto(ZOHO_URL, { 
      waitUntil: 'networkidle', 
      timeout: 30000,
      referer: 'https://www.google.com/'
    });
    
    // Step 5: Check if already logged in
    const currentUrl = page.url();
    log(`Current URL: ${currentUrl}`);
    
    const isLoggedIn = !currentUrl.includes('signin') && !currentUrl.includes('login');
    
    if (!isLoggedIn) {
      // Need to log in
      if (USE_GOOGLE_LOGIN) {
        log('Attempting Google OAuth login...');
        await handleGoogleLogin(page);
      } else {
        log('Attempting password login...');
        await handlePasswordLogin(page);
      }
      
      // Wait for login to complete
      log('Waiting for login to complete...');
      await page.waitForTimeout(5000);
      
      const postLoginUrl = page.url();
      log(`URL after login attempt: ${postLoginUrl}`);
      
      // Check if login was successful
      if (postLoginUrl.includes('signin') || postLoginUrl.includes('login')) {
        log('Still on login page. Login may have failed.', 'ERROR');
        await page.screenshot({ path: 'logs/login-failed.png', fullPage: true });
        
        if (USE_GOOGLE_LOGIN && !useHeadless) {
          log('Please complete the Google login manually in the browser window.', 'INFO');
          log('Waiting 60 seconds for manual login...', 'INFO');
          await page.waitForTimeout(60000);
        } else {
          throw new Error('Login failed or requires additional authentication');
        }
      }
      
      // Save authentication state for future use (only if not using persistent context)
      if (!USE_PERSISTENT_CONTEXT) {
        try {
          const context = page.context();
          await context.storageState({ path: STORAGE_STATE_PATH });
          log('Authentication state saved for future use');
        } catch (err) {
          log(`Warning: Could not save authentication state: ${err.message}`, 'ERROR');
        }
      } else {
        log('Using persistent context - session (including Google login) will be automatically saved');
      }
    } else {
      log('Already logged in using saved session');
    }
    
    // Step 6: Navigate to check-in/check-out page
    const checkinUrl = process.env.ZOHO_CHECKIN_URL || 'https://people.zoho.com/iscalesolutions/zp#home/myspace/overview-actionlist';
    const pageUrl = page.url();
    
    if (!pageUrl.includes('people.zoho.com') || !pageUrl.includes('myspace')) {
      log(`Navigating to check-in/check-out page: ${checkinUrl}`);
      await page.goto(checkinUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000); // Wait for page to fully load
    } else {
      log('Already on check-in/check-out page');
    }
    
    // Step 7: Perform check-in or check-out action
    log('Looking for check-in/check-out button...');
    
    // Get custom selectors from environment variable, or use defaults
    const customSelectors = process.env.CHECKIN_SELECTORS;
    let actionSelectors = [];
    
    if (customSelectors) {
      // Parse comma-separated selectors from environment variable
      actionSelectors = customSelectors.split(',').map(s => s.trim()).filter(s => s.length > 0);
      log(`Using custom selectors: ${actionSelectors.join(', ')}`);
    } else {
      // Default selectors - Zoho People specific
      actionSelectors = [
        '#ZPAtt_check_in_out',  // Primary selector from user
        'button#ZPAtt_check_in_out',
        'button[aria-label*="Check"]',
        'button:has-text("Check-in")',
        'button:has-text("Check-out")',
        'button:has-text("Check In")',
        '[onclick*="TAMSUtil.Attendance.punch"]'
      ];
      log('Using default check-in/check-out selectors');
    }
    
    let actionPerformed = false;
    let actionType = 'unknown';
    
    for (const selector of actionSelectors) {
      try {
        // Wait for button to be available
        await page.waitForSelector(selector, { timeout: 10000 }).catch(() => null);
        
        const actionButton = await page.$(selector);
        if (actionButton) {
          const isVisible = await actionButton.isVisible().catch(() => false);
          if (isVisible) {
            // Get button text to determine action type
            const buttonText = await actionButton.textContent().catch(() => '');
            const ariaLabel = await actionButton.getAttribute('aria-label').catch(() => '');
            
            // Determine if it's check-in or check-out
            if (buttonText.toLowerCase().includes('check-in') || ariaLabel.toLowerCase().includes('check-in')) {
              actionType = 'check-in';
            } else if (buttonText.toLowerCase().includes('check-out') || ariaLabel.toLowerCase().includes('check-out')) {
              actionType = 'check-out';
            } else {
              // Try to infer from button text
              actionType = buttonText.toLowerCase().includes('out') ? 'check-out' : 'check-in';
            }
            
            log(`Found ${actionType} button. Button text: "${buttonText}", Aria-label: "${ariaLabel}"`);
            
            // Scroll into view
            await actionButton.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            
            // Click the button
            await actionButton.click();
            actionPerformed = true;
            log(`${actionType} performed using selector: ${selector}`);
            
            // Wait for action to process
            await page.waitForTimeout(3000);
            
            // Verify action completed by checking if button text changed
            await page.waitForTimeout(2000);
            const newButtonText = await actionButton.textContent().catch(() => '');
            log(`Button text after action: "${newButtonText}"`);
            
            break;
          }
        }
      } catch (err) {
        log(`Error trying selector ${selector}: ${err.message}`);
        // Try next selector
      }
    }
    
    if (!actionPerformed) {
      log('Could not find check-in/check-out button. Taking screenshot for debugging...', 'ERROR');
      await page.screenshot({ path: 'logs/checkin-not-found.png', fullPage: true });
      log('Screenshot saved to logs/checkin-not-found.png');
    } else {
      log(`${actionType} action completed successfully!`);
    }
    
    // Step 8: Take final screenshot for verification
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: `logs/zoho-checkin-${timestamp}.png`, fullPage: true });
    log(`Screenshot saved to logs/zoho-checkin-${timestamp}.png`);
    
    log('Zoho check-in automation completed successfully');
    
  } catch (error) {
    log(`Error during automation: ${error.message}`, 'ERROR');
    log(`Stack trace: ${error.stack}`, 'ERROR');
    
    // Take screenshot on error for debugging
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          await pages[0].screenshot({ path: `logs/error-${timestamp}.png`, fullPage: true });
          log(`Error screenshot saved to logs/error-${timestamp}.png`);
        }
      } catch (screenshotError) {
        log(`Could not take error screenshot: ${screenshotError.message}`, 'ERROR');
      }
    }
    
    process.exit(1);
  } finally {
    // Clean up
    if (browser) {
      await browser.close();
      log('Browser closed');
    } else if (persistentContext) {
      // Close persistent context
      await persistentContext.close();
      log('Browser context closed (session saved)');
    }
  }
}

// Run the automation
if (require.main === module) {
  performZohoCheckin()
    .then(() => {
      log('Script execution completed');
      process.exit(0);
    })
    .catch((error) => {
      log(`Fatal error: ${error.message}`, 'ERROR');
      process.exit(1);
    });
}

/**
 * Handle Google OAuth login
 */
async function handleGoogleLogin(page) {
  log('Looking for Google login button...');
  
  // Get custom selectors from environment variable, or use defaults
  const customGoogleSelectors = process.env.GOOGLE_LOGIN_SELECTORS;
  let googleButtonSelectors = [];
  
  if (customGoogleSelectors) {
    // Parse comma-separated selectors from environment variable
    googleButtonSelectors = customGoogleSelectors.split(',').map(s => s.trim()).filter(s => s.length > 0);
    log(`Using custom Google login selectors: ${googleButtonSelectors.join(', ')}`);
  } else {
    // Default selectors - prioritized for Zoho People
    googleButtonSelectors = [
      // Zoho People specific selectors (from DOM inspection)
      'span[aria-label="Sign in with Google"]',
      'span.google_icon',
      'span[value="google"]',
      '.google_fed',
      'span.fed_div.google_icon',
      // Generic selectors
      'button:has-text("Google")',
      'button:has-text("Sign in with Google")',
      'a:has-text("Google")',
      'a:has-text("Sign in with Google")',
      '[data-provider="google"]',
      '.google-signin',
      'button[aria-label*="Google"]',
      'a[aria-label*="Google"]',
      'span[aria-label*="Google"]'
    ];
    log('Using default Google login selectors');
  }
  
  let googleButtonFound = false;
  for (const selector of googleButtonSelectors) {
    try {
      // Wait a bit for the page to fully load
      await page.waitForTimeout(1000);
      
      const googleButton = await page.$(selector);
      if (googleButton) {
        // Check if element is visible and clickable
        const isVisible = await googleButton.isVisible().catch(() => false);
        if (isVisible) {
          log(`Found Google login button using selector: ${selector}`);
          
          // Scroll into view if needed
          await googleButton.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          
          // Click the button
          await googleButton.click();
          googleButtonFound = true;
          log('Clicked Google login button. Please complete authentication in the browser.');
          
          // Wait for navigation to Google or back to Zoho
          await page.waitForTimeout(3000);
          break;
        } else {
          log(`Google button found with selector ${selector} but not visible, trying next...`);
        }
      }
    } catch (err) {
      log(`Error trying selector ${selector}: ${err.message}`);
      // Try next selector
    }
  }
  
  if (!googleButtonFound) {
    log('Could not find Google login button. Taking screenshot for debugging...', 'ERROR');
    await page.screenshot({ path: 'logs/google-button-not-found.png', fullPage: true });
    log('Screenshot saved to logs/google-button-not-found.png for debugging');
    
    // Don't throw error if running in headed mode - let user click manually
    if (process.env.HEADED !== 'true') {
      throw new Error('Google login button not found. Please check the login page structure or set GOOGLE_LOGIN_SELECTORS in .env');
    } else {
      log('Running in headed mode - please click Google login button manually', 'INFO');
      log('Waiting 60 seconds for manual click...', 'INFO');
      await page.waitForTimeout(60000);
    }
  }
  
  // Wait for Google OAuth flow to complete
  // The user will need to complete this manually if running in headed mode
  log('Waiting for Google OAuth authentication to complete...');
  await page.waitForTimeout(10000); // Give time for OAuth redirects
}

/**
 * Handle password-based login
 */
async function handlePasswordLogin(page) {
  log('Filling in login credentials...');
  
  // Wait for email input field
  await page.waitForSelector('input[type="email"], input[name="login_id"], input[id*="email"], input[id*="login"]', {
    timeout: 10000
  });
  
  // Try multiple possible selectors for email field
  const emailSelectors = [
    'input[type="email"]',
    'input[name="login_id"]',
    'input[id*="email"]',
    'input[id*="login"]',
    '#login_id',
    '#email'
  ];
  
  let emailFilled = false;
  for (const selector of emailSelectors) {
    try {
      const emailField = await page.$(selector);
      if (emailField) {
        await emailField.fill(ZOHO_EMAIL);
        emailFilled = true;
        log(`Email entered using selector: ${selector}`);
        break;
      }
    } catch (err) {
      // Try next selector
    }
  }
  
  if (!emailFilled) {
    throw new Error('Could not find email input field');
  }
  
  // Click next/continue button if present
  const nextButtonSelectors = [
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button[type="submit"]',
    '#nextbtn',
    '.zgh-button'
  ];
  
  for (const selector of nextButtonSelectors) {
    try {
      const nextButton = await page.$(selector);
      if (nextButton && await nextButton.isVisible()) {
        await nextButton.click();
        log('Clicked next/continue button');
        await page.waitForTimeout(2000); // Wait for password field to appear
        break;
      }
    } catch (err) {
      // Continue to next selector
    }
  }
  
  // Fill in password
  log('Filling in password...');
  await page.waitForTimeout(1000); // Brief wait for password field
  
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    '#password',
    'input[id*="password"]'
  ];
  
  let passwordFilled = false;
  for (const selector of passwordSelectors) {
    try {
      const passwordField = await page.$(selector);
      if (passwordField && await passwordField.isVisible()) {
        await passwordField.fill(ZOHO_PASSWORD);
        passwordFilled = true;
        log(`Password entered using selector: ${selector}`);
        break;
      }
    } catch (err) {
      // Try next selector
    }
  }
  
  if (!passwordFilled) {
    throw new Error('Could not find password input field');
  }
  
  // Submit login form
  log('Submitting login form...');
  const submitSelectors = [
    'button[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Login")',
    '#nextbtn',
    'input[type="submit"]'
  ];
  
  let submitted = false;
  for (const selector of submitSelectors) {
    try {
      const submitButton = await page.$(selector);
      if (submitButton && await submitButton.isVisible()) {
        await submitButton.click();
        submitted = true;
        log(`Login form submitted using selector: ${selector}`);
        break;
      }
    } catch (err) {
      // Try next selector
    }
  }
  
  if (!submitted) {
    // Try pressing Enter as fallback
    await page.keyboard.press('Enter');
    log('Submitted login form using Enter key');
  }
}

module.exports = { performZohoCheckin };
