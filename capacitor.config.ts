import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.olivepizza.delivery',
  appName: 'Olive Pizza Delivery',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  ios: {
    contentInset: 'always'
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
