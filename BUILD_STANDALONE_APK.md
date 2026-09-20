# 📱 Build Standalone Android APKs (100% Free)

This guide shows you how to generate installable `.apk` files for both **Auto 24 Driver** and **Auto 24 Viewer** so drivers and passengers can install them on their Android phones with one click (no Google Play Store or credit card required).

---

## ⚡ Quick Summary of Commands

From the root directory of your project:
```bash
# Build Driver App APK
npm run build:driver:apk

# Build Passenger / Viewer App APK
npm run build:viewer:apk
```

---

## Step 1: One-Time Free Setup (Takes 1 Minute)

1. Create a free account at [expo.dev/signup](https://expo.dev/signup) (100% free, no credit card required).
2. In your terminal, log in to your Expo account:
   ```bash
   npx eas login
   ```
   *(Enter your email/username and password).*

---

## Step 2: Build the Standalone Driver APK

The Driver App contains background GPS tracking, foreground notification service, and driver self-registration.

1. Run the build command:
   ```bash
   npm run build:driver:apk
   ```
   *(Or from `driver-app/`: `npx eas build -p android --profile preview`)*

2. When prompted:
   - *"Generate a new Android Keystore?"* → Select **Yes** (EAS will securely manage the signing keys for free).
3. EAS cloud servers will compile the APK. 
4. When finished (usually 5–10 minutes), the terminal will display:
   - A **Direct Download Link** for the `.apk` file.
   - A **QR Code** you can scan with an Android camera to install immediately.

---

## Step 3: Build the Standalone Viewer / Passenger APK

The Passenger App contains the live radar map, 3D interactive Tuk-Tuk models, and pulsing user location beacon.

1. Run the build command:
   ```bash
   npm run build:viewer:apk
   ```
   *(Or from `viewer-app/`: `npx eas build -p android --profile preview`)*

2. When prompted:
   - *"Generate a new Android Keystore?"* → Select **Yes**.
3. EAS will compile the Viewer APK and provide the download link and QR code.

---

## Step 4: Installing on Android Devices

1. Open the download link on your phone (or download the `.apk` on your PC and send it via WhatsApp or USB).
2. Tap on the `.apk` file to install.
3. If Android shows a prompt: *"For your security, your phone is not allowed to install unknown apps from this source"*:
   - Tap **Settings** → Enable **"Allow from this source"** → Tap **Install**.
4. The standalone app is now installed on the phone! It runs independently without Expo Go.

---

## 💻 Optional: Unlimited Local Builds on Your Computer

If you have Android Studio installed and want to compile unlimited APKs locally without waiting for cloud queues:

```bash
# Build Driver APK locally on your machine
cd driver-app
npx eas-cli build -p android --profile preview --local

# Build Viewer APK locally on your machine
cd ../viewer-app
npx eas-cli build -p android --profile preview --local
```
The output `.apk` file will be saved directly into your project folder.
