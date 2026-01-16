# Zoho Playwright Automation

Automated Zoho check-in script that runs locally on macOS at 6:00 AM on weekdays.

## Features

- ✅ Automatic check-in at 6:00 AM, Monday-Friday
- ✅ Headless Playwright automation
- ✅ launchd scheduling (no cloud hosting required)
- ✅ Comprehensive logging and error handling
- ✅ Screenshot capture for debugging

## Prerequisites

- macOS (MacBook)
- Node.js (v14 or higher)
- Playwright browsers installed
- Mac must be awake and user logged in at 6:00 AM

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
npm run install-browsers
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` and set:
- `ZOHO_EMAIL`: Your Zoho email address
- `ZOHO_PASSWORD`: (Optional) Your Zoho password if using password login
- `USE_GOOGLE_LOGIN`: (Optional) Set to `true` if you use "Login with Google" (auto-detected if no password)
- `ZOHO_URL`: (Optional) Zoho login URL (defaults to Zoho People sign-in: `https://accounts.zoho.com/signin?servicename=zohopeople&signupurl=https://www.zoho.com/people/signup.html`)
- `ZOHO_CHECKIN_URL`: (Optional) Direct URL to check-in/check-out page (defaults to: `https://people.zoho.com/iscalesolutions/zp#home/myspace/overview-actionlist`)
- `CHECKIN_SELECTORS`: (Optional) Custom CSS selectors for the check-in button, comma-separated. Example: `CHECKIN_SELECTORS="button#checkin-btn, .checkin-button, [data-action='checkin']"`
- `GOOGLE_LOGIN_SELECTORS`: (Optional) Custom CSS selectors for the Google login button, comma-separated. Defaults work for Zoho People. Example: `GOOGLE_LOGIN_SELECTORS="span[aria-label='Sign in with Google'], .google_icon"`
- `USE_PERSISTENT_CONTEXT`: (Optional) Defaults to `true`. Uses persistent browser context to save and reuse your Google login session. After first login, you won't need to log into Google again. Set to `false` to disable.

**Note for Google OAuth users**: On first run, the script will open a browser window for you to complete Google login. After that, your session will be saved and reused automatically.

### 3. Test the Scripts

Before setting up the scheduler, test the script manually:

```bash
# Test the full check-in automation
npm run checkin
```

**For Google OAuth users (first time setup):**
1. The first time you run `npm run checkin`, a browser window will open
2. **Important**: Google may show a security warning "This browser or app may not be secure"
3. If you see this warning:
   - Click "Try again" or "Advanced" → "Continue to sign in" (if available)
   - Or manually navigate to Google sign-in in the browser window
   - Complete the Google login process manually
4. Once logged in, your session (including Google login) will be saved automatically
5. Future runs will use the saved session automatically (headless mode) - **you won't need to log into Google again**
6. The browser session is saved in `logs/browser-data/` directory
7. If the session expires, the script will prompt you to log in again (just once)

**Note**: Google's security may block automated browsers. If you cannot bypass the security warning, you may need to:
- Use a different Google account that allows "less secure apps"
- Or manually complete the login each time (the session will still be saved for future runs)

### 4. Update launchd Plist File

Edit `com.maytronics.zoho-checkin.plist` and update:

1. **Script path**: Update the wrapper script path in `ProgramArguments` to match your project path:
   ```xml
   <string>/Users/maytronics/maytronics/zoho-automation/scripts/runZohoCheckin.sh</string>
   ```
   The wrapper script automatically finds Node.js and loads your `.env` file.

2. **Log paths**: Update log file paths if needed:
   ```xml
   <string>/Users/maytronics/maytronics/zoho-automation/logs/zoho-checkin.log</string>
   <string>/Users/maytronics/maytronics/zoho-automation/logs/zoho-checkin-error.log</string>
   ```

4. **Environment variables**: The plist uses a wrapper script (`runZohoCheckin.sh`) that automatically loads your `.env` file. No additional configuration needed. Make sure the wrapper script is executable:
   ```bash
   chmod +x scripts/runZohoCheckin.sh
   ```

### 5. Install launchd Service

```bash
# Copy plist to LaunchAgents directory
cp com.maytronics.zoho-checkin.plist ~/Library/LaunchAgents/

# Load the service
launchctl load ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist
```

### 6. Verify Installation

```bash
# Check if the service is loaded
launchctl list | grep zoho-checkin

# View logs
tail -f logs/zoho-checkin.log
tail -f logs/zoho-checkin-error.log
```

## Managing the Service

```bash
# Unload the service (stop scheduling)
launchctl unload ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist

# Reload after making changes
launchctl unload ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist
launchctl load ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist

# Remove the service completely
launchctl unload ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist
rm ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist
```

## Customization

### Adjusting Check-in Selectors

The script uses multiple selectors to find check-in buttons. You can customize them in two ways:

**Option 1: Using Environment Variable (Recommended)**
Add to your `.env` file:
```env
CHECKIN_SELECTORS="button#checkin-btn, .checkin-button, [data-action='checkin'], button:has-text('Check In')"
```

**Option 2: Edit the Script**
Edit `scripts/zohoCheckin.js` and update the `checkinSelectors` array around line 155.

**Finding the Right Selector:**
1. Open your Zoho check-in page in a browser
2. Right-click on the check-in button and select "Inspect"
3. Look at the HTML element and identify:
   - ID: `#element-id`
   - Class: `.element-class`
   - Data attribute: `[data-action="checkin"]`
   - Text content: `button:has-text("Check In")`
4. Add your selector to `CHECKIN_SELECTORS` in `.env` or the script

### Changing Schedule

Edit `com.maytronics.zoho-checkin.plist` and modify the `StartCalendarInterval` entries:

**Current Schedule:**
- Check-in: 6:00 AM (Monday-Friday) - Lines 18-55
- Check-out: 3:30 PM (Monday-Friday) - Lines 58-97

**To Change Times:**
1. Open `com.maytronics.zoho-checkin.plist` in a text editor
2. Find the time entries you want to change:
   - **Check-in times**: Look for entries with `Hour: 6` and `Minute: 0` (lines 19-20, 27-28, 35-36, 43-44, 51-52)
   - **Check-out times**: Look for entries with `Hour: 15` and `Minute: 30` (lines 60-61, 68-69, 76-77, 84-85, 92-93)
3. Change the values:
   - `Hour`: 0-23 (24-hour format, e.g., 9 = 9 AM, 15 = 3 PM, 17 = 5 PM)
   - `Minute`: 0-59 (e.g., 0, 15, 30, 45)
   - `Weekday`: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday

**Example - Change check-in to 8:30 AM:**
```xml
<key>Hour</key>
<integer>8</integer>
<key>Minute</key>
<integer>30</integer>
```

**Example - Change check-out to 5:00 PM:**
```xml
<key>Hour</key>
<integer>17</integer>
<key>Minute</key>
<integer>0</integer>
```

**After editing, reload the schedule:**
```bash
launchctl unload ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist
launchctl load ~/Library/LaunchAgents/com.maytronics.zoho-checkin.plist
```

### Handling 2FA / Additional Authentication

If your Zoho account requires 2FA or additional steps, you'll need to:
1. Use Google OAuth login (recommended) - the script supports this
2. On first run, complete authentication manually in the browser window
3. The session will be saved and reused automatically
4. If session expires, run the script manually once to re-authenticate

### Google OAuth Login

The script automatically detects if you're using Google login (when no password is provided). 

**First-time setup:**
1. Set `USE_GOOGLE_LOGIN=true` in `.env` (or leave `ZOHO_PASSWORD` empty)
2. Run `npm run checkin` - a browser window will open
3. Complete Google login manually
4. Session is saved to `logs/zoho-auth-state.json`
5. Future automated runs will use the saved session (headless)

**If session expires:**
- Delete `logs/zoho-auth-state.json`
- Run the script manually once to re-authenticate

## Troubleshooting

### Script doesn't run at scheduled time

- Verify the Mac is awake and user is logged in
- Check logs: `tail -f logs/zoho-checkin-error.log`
- Verify launchd service is loaded: `launchctl list | grep zoho-checkin`

### Login fails

- Check screenshots in `logs/` directory
- Verify credentials in `.env` file
- Zoho may have changed their login page structure - update selectors if needed

### Browser not found

- Run: `npm run install-browsers`
- Verify Playwright installation: `npx playwright --version`

## Security Notes

- Never commit `.env` file to version control
- The `.env` file contains sensitive credentials
- Consider using macOS Keychain for password storage in production
- Review launchd plist permissions

## Logs

All logs are stored in the `logs/` directory:
- `zoho-checkin.log`: Standard output from scheduled runs
- `zoho-checkin-error.log`: Error output from scheduled runs
- `zoho-checkin-*.png`: Screenshots from successful runs
- `error-*.png`: Screenshots from failed runs

## License

ISC
# checkin-automation
