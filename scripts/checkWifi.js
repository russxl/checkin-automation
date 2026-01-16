#!/usr/bin/env node

/**
 * Wi-Fi SSID Checker for macOS
 * Detects the current Wi-Fi network SSID and verifies it matches the configured office Wi-Fi
 */

const { execSync } = require('child_process');

/**
 * Gets the current Wi-Fi SSID on macOS
 * @returns {string|null} The SSID or null if not connected or error
 */
function getCurrentWiFiSSID() {
  // First, try to find the Wi-Fi interface automatically
  let wifiInterface = null;
  
  try {
    const interfaces = execSync('/usr/sbin/networksetup -listallhardwareports', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Look for Wi-Fi interface - handle both "Wi-Fi" and "AirPort" naming
    const wifiMatch = interfaces.match(/Hardware Port: (?:Wi-Fi|AirPort)\s+Device: (\w+)/);
    if (wifiMatch && wifiMatch[1]) {
      wifiInterface = wifiMatch[1];
      console.log(`DEBUG: Found Wi-Fi interface: ${wifiInterface}`);
    }
  } catch (err) {
    console.error(`DEBUG: Error listing hardware ports: ${err.message}`);
  }
  
  // Try detected interface first, then fallback to common names
  const interfacesToTry = wifiInterface ? [wifiInterface] : ['en0', 'en1'];
  
  for (const iface of interfacesToTry) {
    try {
      const result = execSync(`/usr/sbin/networksetup -getairportnetwork ${iface}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      console.log(`DEBUG: Raw output for ${iface}: "${result.trim()}"`);
      
      // Output format variations:
      // - "Current Wi-Fi Network: SSID_NAME"
      // - "Current AirPort Network: SSID_NAME"
      // - "You are not associated with an AirPort network."
      // - "You are not associated with a Wi-Fi network."
      
      // Check for "not associated" message - this means not connected
      if (result.includes('not associated') || 
          result.includes('not connected') ||
          result.trim() === 'You are not associated with an AirPort network.' ||
          result.trim() === 'You are not associated with a Wi-Fi network.') {
        console.log(`DEBUG: Interface ${iface} exists but not connected to Wi-Fi`);
        continue;
      }
      
      // Try multiple regex patterns to match different output formats
      const patterns = [
        /Current (?:Wi-Fi|AirPort) Network:\s*(.+)/,
        /Current Network:\s*(.+)/,
        /Network Name:\s*(.+)/,
        /SSID:\s*(.+)/,
        /^(.+)$/  // Last resort: take the whole line if it's not an error message
      ];
      
      for (const pattern of patterns) {
        const match = result.match(pattern);
        if (match && match[1]) {
          const ssid = match[1].trim();
          // Filter out error messages and empty strings
          if (ssid && 
              ssid.length > 0 && 
              !ssid.toLowerCase().includes('error') &&
              !ssid.toLowerCase().includes('not associated') &&
              !ssid.toLowerCase().includes('not connected')) {
            console.log(`DEBUG: Detected Wi-Fi SSID: ${ssid} on interface ${iface}`);
            return ssid;
          }
        }
      }
    } catch (error) {
      // Check if it's because the interface doesn't exist
      const errorMsg = error.message || error.toString();
      if (errorMsg.includes('does not exist') || errorMsg.includes('not found')) {
        console.log(`DEBUG: Interface ${iface} does not exist`);
        continue;
      }
      // Other errors (like permission issues)
      console.error(`DEBUG: Error checking interface ${iface}: ${errorMsg}`);
      // Also check stderr output if available
      if (error.stderr) {
        console.error(`DEBUG: stderr: ${error.stderr.toString()}`);
      }
    }
  }
  
  // If we still haven't found it, try using system_profiler as a fallback
  try {
    const result = execSync('/usr/sbin/system_profiler SPAirPortDataType', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    console.log('DEBUG: Trying system_profiler fallback...');
    const ssidMatch = result.match(/Current Network Information:\s*\n\s*Network Name:\s*(.+)/);
    if (ssidMatch && ssidMatch[1]) {
      const ssid = ssidMatch[1].trim();
      console.log(`DEBUG: Detected Wi-Fi SSID via system_profiler: ${ssid}`);
      return ssid;
    }
  } catch (err) {
    console.error(`DEBUG: system_profiler fallback failed: ${err.message}`);
  }
  
  // Try using scutil to get network configuration
  try {
    console.log('DEBUG: Trying scutil fallback...');
    // Get current network service
    const state = execSync('/usr/sbin/scutil --nc list', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Look for connected Wi-Fi service
    const lines = state.split('\n');
    for (const line of lines) {
      // Look for lines like: (*) Wi-Fi (Connected) or Wi-Fi (Connected)
      if ((line.includes('Wi-Fi') || line.includes('AirPort')) && line.includes('Connected')) {
        // Extract service name
        let serviceName = null;
        const match = line.match(/\((.+)\)/);
        if (match && match[1]) {
          serviceName = match[1].trim();
        } else {
          // Try to extract from format like "Wi-Fi (Connected)"
          const nameMatch = line.match(/(?:Wi-Fi|AirPort)\s*\(([^)]+)\)/);
          if (nameMatch) {
            serviceName = nameMatch[1].trim();
          }
        }
        
        if (serviceName) {
          // Get the SSID for this service
          try {
            const info = execSync(`/usr/sbin/scutil --nc show "${serviceName}"`, {
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe']
            });
            const ssidMatch = info.match(/SSID:\s*(.+)/);
            if (ssidMatch && ssidMatch[1]) {
              const ssid = ssidMatch[1].trim();
              console.log(`DEBUG: Detected Wi-Fi SSID via scutil: ${ssid}`);
              return ssid;
            }
          } catch (showErr) {
            // Service might not have SSID info, continue
            console.log(`DEBUG: Could not get SSID for service ${serviceName}`);
          }
        }
      }
    }
    
    // Alternative: try to get SSID from system preferences
    try {
      const prefs = execSync('/usr/sbin/scutil --prefs', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const ssidMatch = prefs.match(/SSID[:\s]+([^\s\n]+)/i);
      if (ssidMatch && ssidMatch[1]) {
        const ssid = ssidMatch[1].trim();
        if (ssid && ssid.length > 0) {
          console.log(`DEBUG: Detected Wi-Fi SSID via scutil prefs: ${ssid}`);
          return ssid;
        }
      }
    } catch (prefsErr) {
      // Ignore prefs errors
    }
  } catch (err) {
    console.error(`DEBUG: scutil fallback failed: ${err.message}`);
  }
  
  // Try using wdutil (newer Apple recommended tool)
  try {
    const result = execSync('/usr/bin/wdutil info', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    console.log('DEBUG: Trying wdutil command fallback...');
    console.log(`DEBUG: wdutil output:\n${result.substring(0, 500)}`); // Limit output length
    
    // wdutil output format varies, look for SSID
    const ssidMatch = result.match(/SSID[:\s]+([^\s\n]+)/i);
    if (ssidMatch && ssidMatch[1]) {
      const ssid = ssidMatch[1].trim();
      if (ssid && 
          ssid.length > 0 && 
          ssid.toLowerCase() !== 'off' &&
          ssid.toLowerCase() !== 'none' &&
          !ssid.includes('not associated')) {
        console.log(`DEBUG: Detected Wi-Fi SSID via wdutil: ${ssid}`);
        return ssid;
      }
    }
  } catch (err) {
    console.error(`DEBUG: wdutil command fallback failed: ${err.message}`);
  }
  
  // Try using airport command as last resort (deprecated but might still work)
  try {
    const airportPath = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
    const result = execSync(`${airportPath} -I 2>&1`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Skip if it's just the deprecation warning
    if (result.includes('deprecated') && !result.includes('SSID:')) {
      console.log('DEBUG: airport command is deprecated, skipping...');
    } else {
      console.log('DEBUG: Trying airport command fallback (deprecated)...');
      
      // Airport command output format:
      // SSID: NetworkName
      // BSSID: aa:bb:cc:dd:ee:ff
      // etc.
      const ssidMatch = result.match(/^\s*SSID:\s*(.+)$/m);
      if (ssidMatch && ssidMatch[1]) {
        const ssid = ssidMatch[1].trim();
        // Check if SSID is not empty and not "off" or "none"
        if (ssid && 
            ssid.length > 0 && 
            ssid.toLowerCase() !== 'off' &&
            ssid.toLowerCase() !== 'none' &&
            !ssid.includes('not associated')) {
          console.log(`DEBUG: Detected Wi-Fi SSID via airport command: ${ssid}`);
          return ssid;
        }
      }
    }
  } catch (err) {
    console.error(`DEBUG: airport command fallback failed: ${err.message}`);
  }
  
  return null;
}

/**
 * Checks if the current Wi-Fi SSID matches any of the expected office Wi-Fi networks
 * @param {string|string[]} expectedSSIDs - The expected office Wi-Fi SSID(s). Can be:
 *   - A single SSID string
 *   - A comma-separated string of SSIDs
 *   - An array of SSID strings
 * @returns {boolean} True if SSID matches any of the office Wi-Fi networks, false otherwise
 */
function isOnOfficeWiFi(expectedSSIDs) {
  if (!expectedSSIDs) {
    console.error('ERROR: Office Wi-Fi SSID not configured');
    return false;
  }
  
  // Convert to array if it's a string (support comma-separated or single)
  let officeSSIDs = [];
  if (Array.isArray(expectedSSIDs)) {
    officeSSIDs = expectedSSIDs;
  } else if (typeof expectedSSIDs === 'string') {
    // Split by comma and trim each SSID
    officeSSIDs = expectedSSIDs.split(',').map(ssid => ssid.trim()).filter(ssid => ssid.length > 0);
  } else {
    console.error('ERROR: Invalid office Wi-Fi SSID format');
    return false;
  }
  
  if (officeSSIDs.length === 0) {
    console.error('ERROR: No valid office Wi-Fi SSIDs configured');
    return false;
  }
  
  const currentSSID = getCurrentWiFiSSID();
  
  if (!currentSSID) {
    console.error('ERROR: Could not detect current Wi-Fi network');
    console.error('DEBUG: Troubleshooting steps:');
    console.error('  1. Make sure you are connected to a Wi-Fi network');
    console.error('  2. Check Wi-Fi status: System Settings > Network');
    console.error('  3. Try running: /usr/sbin/networksetup -getairportnetwork en0');
    console.error('  4. If that fails, try: /usr/sbin/networksetup -listallhardwareports');
    return false;
  }
  
  // Check if current SSID matches any of the office Wi-Fi networks
  const isMatch = officeSSIDs.includes(currentSSID);
  
  if (!isMatch) {
    console.log(`INFO: Current Wi-Fi (${currentSSID}) does not match any office Wi-Fi networks`);
    console.log(`INFO: Office Wi-Fi networks: ${officeSSIDs.join(', ')}`);
  } else {
    console.log(`INFO: Connected to office Wi-Fi (${currentSSID})`);
  }
  
  return isMatch;
}

// If run directly, check against environment variable
if (require.main === module) {
  require('dotenv').config();
  
  // Test mode: if --test flag is passed, just show current Wi-Fi without checking
  if (process.argv.includes('--test') || process.argv.includes('-t')) {
    console.log('TEST MODE: Detecting current Wi-Fi network...\n');
    const currentSSID = getCurrentWiFiSSID();
    if (currentSSID) {
      console.log(`✓ Current Wi-Fi SSID: ${currentSSID}`);
      process.exit(0);
    } else {
      console.error('✗ Could not detect Wi-Fi network');
      process.exit(1);
    }
  }
  
  const officeSSID = process.env.OFFICE_WIFI_SSID;
  
  if (!officeSSID) {
    console.error('ERROR: OFFICE_WIFI_SSID environment variable not set');
    console.error('INFO: You can set multiple SSIDs separated by commas, e.g.:');
    console.error('      OFFICE_WIFI_SSID="iScale Solutions_5G,iScale_M,iScale_Solutions_W6,Maytronics Au/Us"');
    console.error('\nTIP: Run with --test flag to debug Wi-Fi detection:');
    console.error('      node scripts/checkWifi.js --test');
    process.exit(1);
  }
  
  const onOfficeWiFi = isOnOfficeWiFi(officeSSID);
  process.exit(onOfficeWiFi ? 0 : 1);
}

module.exports = { getCurrentWiFiSSID, isOnOfficeWiFi };
