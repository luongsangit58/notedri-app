import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Gọi 1 lần lúc app khởi động (App.tsx AppLoader) - bắt buộc trước khi gọi GoogleSignin.signIn()
// ở bất kỳ đâu (LoginScreen, ProfileScreen). webClientId để lấy idToken có 'aud' khớp
// config('services.google.client_id') phía backend (AuthController::googleMobile()/googleLink())
// - PHẢI dùng Web client ID (không phải Android/iOS client ID) để idToken verify được ở backend.
// iosClientId bắt buộc khai báo tay trên iOS vì app không có file GoogleService-Info.plist
// (dùng cách "without Firebase" của package - chỉ cần iosUrlScheme ở app.json + client ID ở đây).
export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ...(Platform.OS === 'ios' ? { iosClientId: '1004530110791-uvljer95ckbukae91k46m6324h7rg9si.apps.googleusercontent.com' } : {}),
    offlineAccess: false,
  });
}
