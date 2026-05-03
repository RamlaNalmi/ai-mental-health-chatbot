# Expo Setup Guide for MindfulChat

## 🚀 Quick Start with Expo

Since you're using Expo, here's how to get your mental health chatbot app running:

### Prerequisites
- Node.js installed
- Expo CLI: `npm install -g @expo/cli`
- Expo Go app on your phone (recommended for testing)
- Backend server running

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npx expo start
```

### 3. Run on Device/Emulator
- **Physical Device**: Open Expo Go app and scan the QR code
- **iOS Simulator**: Press `i` in the terminal
- **Android Emulator**: Press `a` in the terminal
- **Web**: Press `w` in the terminal

## 📱 Expo-Specific Features Enabled

### Permissions
- **Microphone Access**: For voice input functionality
- **Speech Recognition**: For converting speech to text
- **Internet Access**: For API communication

### App Configuration
- **App Name**: MindfulChat
- **Bundle ID**: com.mindfulchat.app
- **Splash Screen**: Purple theme (#667eea)
- **Orientation**: Portrait only

## 🔧 Development Commands

```bash
# Start development server
npx expo start

# Start with specific platform
npx expo start --ios
npx expo start --android
npx expo start --web

# Build for production
npx expo build:android
npx expo build:ios

# Install app on device
npx expo install
```

## 🌐 Backend Configuration

Update your backend URL in `services/api.js`:

```javascript
const API_BASE_URL = 'http://YOUR_COMPUTER_IP:8000';
```

**Important**: When testing on physical devices, use your computer's IP address instead of localhost.

## 📋 Testing Checklist

- [ ] Backend server is running on port 8000
- [ ] Updated API_BASE_URL with correct IP
- [ ] Microphone permissions granted
- [ ] Voice recording works
- [ ] Authentication flow works
- [ ] Chat messages send/receive properly

## 🐛 Common Expo Issues & Solutions

### Voice Recognition Not Working
```bash
# Reinstall voice package
npm uninstall @react-native-community/voice
npm install @react-native-community/voice
npx expo install
```

### Network Issues
- Make sure your device and computer are on the same WiFi network
- Use your computer's IP address instead of localhost
- Check firewall settings

### Build Issues
```bash
# Clear cache
npx expo start -c

# Reset node modules
rm -rf node_modules
npm install
npx expo start
```

## 🎨 Customization

### App Icon & Splash Screen
Replace files in `assets/` folder:
- `icon.png` - App icon (1024x1024)
- `splash-icon.png` - Splash screen image
- `favicon.png` - Web favicon

### Colors
Update color scheme in screen components:
- Primary: `#667eea` (purple)
- Background: `#f5f5f5` (light gray)
- Text: Dark grays and whites

## 📦 Publishing to App Stores

When ready to publish:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

## 🔗 Useful Links

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Navigation](https://reactnavigation.org/)
- [Expo Go App](https://expo.dev/expo-go)

## 🆘 Support

If you encounter issues:
1. Check Expo CLI version: `expo --version`
2. Clear cache: `expo start -c`
3. Reinstall dependencies: `npm install`
4. Check backend connection
5. Verify permissions in device settings
