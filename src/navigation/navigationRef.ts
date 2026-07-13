import { createNavigationContainerRef } from '@react-navigation/native';

// Cho phép điều hướng từ ngoài cây component (Linking listener, NFC trigger...)
// nơi không có prop `navigation` sẵn có.
export const navigationRef = createNavigationContainerRef<any>();
