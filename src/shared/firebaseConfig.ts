// Cấu hình web app "HPMA" của project tnm---hpma. Đây là định danh công khai (có trong mọi bundle web),
// không phải bí mật: quyền truy cập do Firebase Auth + Database Rules quyết định (SPEC-AUTO-001 §8.2).
const firebaseConfig = {
  apiKey: 'AIzaSyDXH8y5BmBlaYE7DLVlYw52T8wiv0lMpXk',
  authDomain: 'tnm---hpma.firebaseapp.com',
  databaseURL:
    'https://tnm---hpma-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'tnm---hpma',
  appId: '1:151407027668:web:66273131509f1f4a6de241',
};

export default firebaseConfig;
