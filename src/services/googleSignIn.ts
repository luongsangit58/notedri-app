import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Gọi 1 lần lúc app khởi động (App.tsx AppLoader) - bắt buộc trước khi gọi GoogleSignin.signIn()
// ở bất kỳ đâu (LoginScreen, ProfileScreen). webClientId để lấy idToken có 'aud' khớp
// config('services.google.client_id') phía backend (AuthController::googleMobile()/googleLink())
// - PHẢI dùng Web client ID (không phải Android/iOS client ID) để idToken verify được ở backend.
export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
}
