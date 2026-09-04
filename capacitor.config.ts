import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.olivepizza.delivery',
  appName: 'Olive Pizza Delivery',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['*.firebaseapp.com', '*.googleapis.com', '*.onrender.com'],
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#090e17',
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
      googleClientId: '1017239455106-i8vrpdq1v51pkg0308k7btu1o4img597.apps.googleusercontent.com',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
